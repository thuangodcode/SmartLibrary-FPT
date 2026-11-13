using System.Text.Json;
using AutoMapper;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SmartLibrary.Api.Controllers;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Application.Features.Books.DTOs;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Application.Mapping;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Infrastructure.Persistence.Migrations;
using SmartLibrary.Infrastructure.Persistence.Repositories;
using SmartLibrary.Infrastructure.Services;

namespace SmartLibrary.IntegrationTests;

public sealed partial class CopyLifecycleTests
{
    [BookCodePostgresFact]
    public async Task ReturnFinePaymentIsExplicitAndStockOnlyIncreasesWhenShelved()
    {
        foreach (var paidNow in new[] { false, true })
        {
            await using var fixture = await Fixture.CreateAsync();
            await PrepareOverdueReturnAsync(fixture);
            await using (var db = fixture.Context())
            {
                var result = await Service(db).ReturnAsync(new()
                {
                    Barcode = "TEST001-01", LoanId = fixture.LoanId, Condition = "Good", PaidNow = paidNow
                }, fixture.StaffId);
                Assert.True(result.IsSuccess, result.Error);
                Assert.Equal(paidNow, result.Data!.CashPaymentRecorded);
                Assert.Equal(15000m, result.Data.CreatedFineAmount);
            }
            await using (var db = fixture.Context())
            {
                Assert.Equal(0, (await db.Books.SingleAsync()).AvailableCopies);
                var copy = await db.BookCopies.SingleAsync();
                Assert.Null(copy.Location); Assert.True(copy.IsAvailable);
                var fine = await db.Fines.SingleAsync();
                Assert.Equal(paidNow ? FineStatus.Paid : FineStatus.Pending, fine.Status);
                Assert.Equal(paidNow ? 1 : 0, await db.FinePayments.CountAsync());
                if (paidNow)
                {
                    var receipt = await db.FinePayments.SingleAsync();
                    Assert.Equal(fine.Id, receipt.FineId); Assert.Equal(fine.Amount, receipt.Amount);
                    Assert.Equal("Cash", receipt.Method); Assert.Equal(FinePaymentStatus.Paid, receipt.Status);
                    Assert.Equal(fixture.StaffId, receipt.RecordedById);
                }
                Assert.False((await Service(db).ReturnAsync(new()
                {
                    Barcode = "TEST001-01", LoanId = fixture.LoanId, Condition = "Good", PaidNow = true
                }, fixture.StaffId)).IsSuccess);
                Assert.Equal(paidNow ? 1 : 0, await db.FinePayments.CountAsync());
                Assert.IsType<OkObjectResult>(await new BookCopiesController(db)
                    .TransferLocations(new([new(fixture.CopyId, fixture.ShelfA)]), Service(db)));
                Assert.Equal(1, (await db.Books.SingleAsync()).AvailableCopies);
                Assert.Single(await db.Fines.ToListAsync());
            }
        }
    }

    [BookCodePostgresFact]
    public async Task CashOnReturnPreservesHistoricalAmountAndDoesNotDuplicateReceipts()
    {
        await using var fixture = await Fixture.CreateAsync();
        await PrepareOverdueReturnAsync(fixture);
        await using (var db = fixture.Context())
        {
            var loan = await db.BorrowRecords.SingleAsync();
            db.Fines.Add(new Fine { ReaderId = loan.ReaderId, BorrowRecordId = loan.Id,
                Amount = 7000, Reason = "Phạt quá hạn 1 ngày" });
            await db.SaveChangesAsync();
        }
        await using (var db = fixture.Context())
        {
            var result = await Service(db).ReturnAsync(new()
            {
                Barcode = "TEST001-01", Condition = "Good", PaidNow = true
            }, fixture.StaffId);
            Assert.True(result.IsSuccess, result.Error);
            Assert.Null(result.Data!.CreatedFineAmount);
            Assert.True(result.Data.CashPaymentRecorded);
        }
        await using (var db = fixture.Context())
        {
            var fine = await db.Fines.SingleAsync();
            Assert.Equal(7000m, fine.Amount); Assert.Equal(FineStatus.Paid, fine.Status);
            Assert.True((await Service(db).PayFineAsync(fine.Id, fixture.StaffId)).IsSuccess);
            Assert.Single(await db.FinePayments.ToListAsync());
        }
    }

    [BookCodePostgresFact]
    public async Task ReturnAndCashPaymentRollbackIfExistingOnlineCheckoutCannotBeCancelled()
    {
        await using var fixture = await Fixture.CreateAsync();
        await PrepareOverdueReturnAsync(fixture);
        await using (var db = fixture.Context())
        {
            var loan = await db.BorrowRecords.SingleAsync();
            var fine = new Fine { ReaderId = loan.ReaderId, BorrowRecordId = loan.Id,
                Amount = 7000, Reason = "Phạt quá hạn 1 ngày" };
            db.Add(new FinePayment { Fine = fine, Amount = fine.Amount, OrderCode = 1234,
                Method = "PayOS", ExpiresAt = DateTime.UtcNow.AddHours(1) });
            await db.SaveChangesAsync();
        }
        await using (var db = fixture.Context())
        {
            // NoPayments throws instead of contacting any real payment provider.
            await Assert.ThrowsAsync<NotSupportedException>(() => Service(db).ReturnAsync(new()
            {
                Barcode = "TEST001-01", Condition = "Good", PaidNow = true
            }, fixture.StaffId));
        }
        await using (var db = fixture.Context())
        {
            var loan = await db.BorrowRecords.SingleAsync();
            Assert.Equal(BorrowStatus.Overdue, loan.Status); Assert.Null(loan.ReturnDate);
            Assert.Equal(FineStatus.Pending, (await db.Fines.SingleAsync()).Status);
            Assert.Equal(FinePaymentStatus.Pending, (await db.FinePayments.SingleAsync()).Status);
        }
    }

    [BookCodePostgresFact]
    public async Task ReaderListsUsePersistedClassificationAndIncludeRealCirculationCounts()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.SingleAsync(); loan.Status = BorrowStatus.Overdue;
        var reader = await db.UserProfiles.SingleAsync(user => user.Id != fixture.StaffId);
        reader.ReaderType = ReaderType.Lecturer; reader.TeacherId = "GV-REVIEW";
        db.RegistrationRequests.Add(new RegistrationRequest { UserId = reader.Id, Status = RegistrationRequestStatus.Approved });
        db.Fines.Add(new Fine { ReaderId = reader.Id, BorrowRecordId = loan.Id, Amount = 20000, Reason = "Kiểm thử" });
        await db.SaveChangesAsync();
        var repository = new ReaderRepository(db);
        var (items, count) = await repository.GetPagedAsync("GV-REVIEW", null, ReaderType.Lecturer, 1, 10);
        Assert.Equal(1, count); Assert.Equal(ReaderType.Lecturer, Assert.Single(items).ReaderType);
        Assert.Equal(1, items[0].BorrowingCount); Assert.Equal(1, items[0].OverdueCount);
        var stats = await repository.GetStatsAsync();
        Assert.Equal(1, stats.LecturerReaders); Assert.Equal(0, stats.ExternalReaders);
        var users = new AdminUserManagementService(db, null!, null!, null!,
            new ConfigurationBuilder().Build(), NullLogger<AdminUserManagementService>.Instance);
        var json = JsonSerializer.SerializeToElement(await users.GetUsersAsync("Reader", "GV-REVIEW", null,
            "Lecturer", 1, 10, default), new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var item = Assert.Single(json.GetProperty("items").EnumerateArray());
        Assert.Equal(reader.Id, item.GetProperty("id").GetGuid());
        Assert.Equal(1, item.GetProperty("borrowingCount").GetInt32());
        Assert.Equal(1, item.GetProperty("overdueCount").GetInt32());
        Assert.Equal(20000m, item.GetProperty("unpaidFines").GetDecimal());
    }

    [BookCodePostgresFact]
    public async Task ReminderMigrationPreservesLegacySettingsAndAcceptsNewChoices()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var original = new CirculationReminderSetting { IsEnabled = true, ReminderDays = 14 };
        db.Add(original); await db.SaveChangesAsync();
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE circulation_reminder_settings ADD CONSTRAINT ck_circulation_reminder_days CHECK (reminder_days IN (7, 14))");
        var migration = new ExpandCirculationReminderDays();
        foreach (var operation in migration.UpOperations.Cast<SqlOperation>())
            await db.Database.ExecuteSqlRawAsync(operation.Sql);
        var controller = new CirculationController(Service(db), null!, NullLogger<CirculationController>.Instance, db)
        { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };
        var beforeRead = original.UpdatedAt;
        var get = Assert.IsType<OkObjectResult>(await controller.GetDueReminderSettings(default));
        var value = Assert.IsType<ApiResponse<CirculationDueReminderSettingsDto>>(get.Value);
        Assert.Equal(14, value.Data!.ReminderDays);
        await db.Entry(original).ReloadAsync(); Assert.Equal(beforeRead, original.UpdatedAt);
        foreach (var days in new[] { 2, 4, 7, 14 })
        {
            Assert.IsType<OkObjectResult>(await controller.UpdateDueReminderSettings(new()
            { IsEnabled = true, ReminderDays = days }, default));
            Assert.Equal(days, (await db.CirculationReminderSettings.AsNoTracking().SingleAsync()).ReminderDays);
        }
        Assert.IsType<BadRequestObjectResult>(await controller.UpdateDueReminderSettings(new()
        { ReminderDays = 3 }, default));
    }

    [BookCodePostgresFact]
    public async Task IncreasingCopiesThroughBookFormCreatesDistinctWarehouseCopies()
    {
        await using var fixture = await Fixture.CreateAsync();
        Guid bookId;
        await using (var db = fixture.Context()) bookId = (await db.Books.SingleAsync()).Id;
        async Task UpdateCopies()
        {
            await using var db = fixture.Context();
            using var cache = new MemoryCache(new MemoryCacheOptions());
            var catalog = new BookCatalogCache(db, cache);
            var mapper = new MapperConfiguration(cfg => cfg.AddMaps(typeof(MappingProfile).Assembly), NullLoggerFactory.Instance).CreateMapper();
            var service = new BookService(new BookRepository(db, catalog), new UnitOfWork(db), mapper,
                new BookCodeGenerator(db), new ReviewImageStorage());
            using var image = new MemoryStream(new byte[] { 1, 2, 3 });
            var result = await new BooksController(service, Service(db), db).UpdateFromForm(bookId,
                new UpdateBookForm { Title = "Sách đã cập nhật", TotalCopies = 3,
                    CoverImage = new FormFile(image, 0, image.Length, "CoverImage", "cover.png") }, default);
            Assert.IsType<OkObjectResult>(result);
        }
        await Task.WhenAll(UpdateCopies(), UpdateCopies());
        await using var verify = fixture.Context();
        var copies = await verify.BookCopies.OrderBy(copy => copy.Barcode).ToListAsync();
        Assert.Equal(3, copies.Count);
        Assert.Equal(3, copies.Select(copy => copy.Barcode).Distinct().Count());
        Assert.All(copies, copy => Assert.Null(copy.Location));
        Assert.Equal(3, (await verify.Books.SingleAsync()).TotalCopies);
        Assert.Equal(0, (await verify.Books.SingleAsync()).AvailableCopies);
        Assert.Equal("https://example.test/cover.png", (await verify.Books.SingleAsync()).CoverImageUrl);
    }

    private static async Task PrepareOverdueReturnAsync(Fixture fixture)
    {
        await using var db = fixture.Context();
        db.BookIncidents.RemoveRange(db.BookIncidents);
        var loan = await db.BorrowRecords.SingleAsync();
        loan.Status = BorrowStatus.Overdue; loan.ReturnDate = null; loan.DueDate = DateTime.UtcNow.AddDays(-3);
        (await db.BookCopies.SingleAsync()).Condition = BookCondition.Good;
        await db.SaveChangesAsync();
    }

    private sealed class ReviewImageStorage : IStorageService
    {
        public Task<string> UploadFileAsync(Stream stream, string name, string bucket, CancellationToken ct = default)
            => Task.FromResult("https://example.test/cover.png");
        public Task DeleteFileAsync(string path, string bucket, CancellationToken ct = default) => throw new NotSupportedException();
        public string GetPublicUrl(string path, string bucket) => throw new NotSupportedException();
        public Task<string> CreatePresignedUrlAsync(string path, string bucket, int seconds = 60, CancellationToken ct = default)
            => throw new NotSupportedException();
    }
}
