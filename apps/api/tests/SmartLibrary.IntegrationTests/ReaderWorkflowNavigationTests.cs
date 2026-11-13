using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Notifications;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence.Repositories;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Api.Controllers;

namespace SmartLibrary.IntegrationTests;

public sealed partial class CopyLifecycleTests
{
    [BookCodePostgresFact]
    public async Task BulkShelvingRejectsOverCapacityAtomicallyAndAcceptsLightDamage()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        db.BookIncidents.RemoveRange(db.BookIncidents);
        var first = await db.BookCopies.SingleAsync(); first.Condition = BookCondition.LightDamaged; first.IsAvailable = true;
        var second = new BookCopy { BookId = first.BookId, Barcode = "TEST001-02", Condition = BookCondition.Good, IsAvailable = true };
        db.Add(second); await db.SaveChangesAsync();
        var controller = new BookCopiesController(db);
        Assert.IsType<ConflictObjectResult>(await controller.TransferLocations(new([new(first.Id, fixture.ShelfA), new(second.Id, fixture.ShelfA)]), Service(db)));
        Assert.All(await db.BookCopies.ToListAsync(), copy => Assert.Null(copy.Location));
        db.ChangeTracker.Clear();
        var shelf = await db.StorageShelves.SingleAsync(x => x.Name == fixture.ShelfA); shelf.Capacity = 2;
        await db.SaveChangesAsync();
        Assert.IsType<OkObjectResult>(await controller.TransferLocations(new([new(first.Id, fixture.ShelfA), new(second.Id, fixture.ShelfA)]), Service(db)));
        Assert.All(await db.BookCopies.ToListAsync(), copy => Assert.Equal(fixture.ShelfA, copy.Location));
        Assert.Equal(2, (await db.Books.SingleAsync()).AvailableCopies);
    }

    [BookCodePostgresFact]
    public async Task ReturnWithOverdueFeeStillLinksToReturnedLoan()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        db.BookIncidents.RemoveRange(db.BookIncidents);
        var loan = await db.BorrowRecords.SingleAsync();
        loan.Status = BorrowStatus.Borrowed; loan.ReturnDate = null; loan.DueDate = DateTime.UtcNow.AddDays(-3);
        await db.SaveChangesAsync();
        var result = await Service(db).ReturnAsync(new() { Barcode = "TEST001-01", Condition = "Good" }, fixture.StaffId);
        Assert.True(result.IsSuccess, result.Error);
        Assert.Single(await db.Fines.ToListAsync());
        var notification = await db.Notifications.SingleAsync(x => x.Title == "Đã trả sách");
        Assert.Equal($"/history?tab=loans&loanId={loan.Id}", NotificationInbox.Map(notification).Href);
    }

    [BookCodePostgresFact]
    public async Task FocusedReaderLoanRequiresOwnershipAndKeepsReaderRenewalRules()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.SingleAsync();
        loan.Status = BorrowStatus.Borrowed; loan.ReturnDate = null; loan.DueDate = DateTime.UtcNow.AddDays(10);
        await db.SaveChangesAsync();
        var repo = new CirculationRepository(db);
        var settings = await repo.GetSettingsAsync(default);
        var own = await repo.GetLoanForReaderAsync(loan.ReaderId, loan.Id, settings, default);
        var list = await repo.GetLoansForReaderAsync(loan.ReaderId, 1, 20, settings, default);
        Assert.NotNull(own);
        Assert.Equal(list.Items.Single().CanRenew, own.CanRenew);
        Assert.Equal(list.Items.Single().RenewalUnavailableReason, own.RenewalUnavailableReason);
        Assert.Null(await repo.GetLoanForReaderAsync(fixture.StaffId, loan.Id, settings, default));
        Assert.Null(await repo.GetLoanForReaderAsync(loan.ReaderId, Guid.NewGuid(), settings, default));
    }

    [BookCodePostgresFact]
    public async Task LatestRejectionComesFirstAndReaderSeesReasonAndExactNotification()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        db.BookIncidents.RemoveRange(db.BookIncidents);
        var loan = await db.BorrowRecords.SingleAsync();
        loan.Status = BorrowStatus.Pending; loan.BorrowDate = null; loan.ReturnDate = null;
        loan.CreatedAt = DateTime.UtcNow.AddDays(-20);
        db.Add(new BorrowRecord { ReaderId = loan.ReaderId, BookCopyId = loan.BookCopyId, Status = BorrowStatus.Rejected, CreatedAt = DateTime.UtcNow.AddDays(-1) });
        await db.SaveChangesAsync();
        // Make both request timestamps older than the actual rejection below.
        await db.BorrowRecords.ExecuteUpdateAsync(setters => setters.SetProperty(x => x.UpdatedAt, DateTime.UtcNow.AddDays(-1)));
        db.ChangeTracker.Clear();
        Assert.True((await Service(db).RejectAsync(loan.Id, notes: "Độc giả yêu cầu đổi lịch.")).IsSuccess);
        var page = await Service(db).GetLoansAsync(null, "Rejected", null, null, 1, 1);
        Assert.Equal(loan.Id, page.Items.Single().Id);
        var mine = await Service(db).GetMyLoanAsync(loan.ReaderId, loan.Id);
        Assert.Equal("Độc giả yêu cầu đổi lịch.", mine.Data!.RejectionReason);
        var notification = await db.Notifications.SingleAsync(x => x.Type == "borrow");
        Assert.Equal($"/history?tab=loans&loanId={loan.Id}", NotificationInbox.Map(notification).Href);
    }

    [Theory]
    [InlineData(null, "Chưa có lý do được ghi nhận.")]
    [InlineData("Ghi chú cũ | Yêu cầu bị từ chối/hủy bởi thủ thư. Đổi lịch", "Đổi lịch")]
    [InlineData("Yêu cầu bị từ chối/hủy bởi thủ thư. ", "Thủ thư chưa ghi lý do.")]
    [InlineData("Tự hủy vì độc giả không đến trong vòng 30 phút sau lịch nhận.", "Đã hết thời gian nhận sách theo lịch hẹn.")]
    public void RejectionReasonDoesNotExposeUnrelatedInternalNotes(string? notes, string expected)
        => Assert.Equal(expected, CirculationRules.RejectionReason(notes));
}
