using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence.Repositories;
using SmartLibrary.Api.Controllers;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Application.Common;
using SmartLibrary.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using SmartLibrary.Infrastructure.Persistence.Migrations;

namespace SmartLibrary.IntegrationTests;

public sealed partial class CopyLifecycleTests
{
    [BookCodePostgresFact]
    public async Task LegacyDocumentSchemaCanBeUpgradedWithoutLosingDocuments()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        await db.Database.ExecuteSqlRawAsync("ALTER TABLE identity_documents DROP COLUMN deleted_at;");
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var builder = new MigrationBuilder("Npgsql.EntityFrameworkCore.PostgreSQL");
            typeof(AddIdentityDocumentDeletedAt).GetMethod("Up", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!
                .Invoke(new AddIdentityDocumentDeletedAt(), [builder]);
            foreach (var operation in builder.Operations.Cast<SqlOperation>())
                await db.Database.ExecuteSqlRawAsync(operation.Sql);
        }
        Assert.Empty(await db.IdentityDocuments.ToListAsync());
    }

    [BookCodePostgresFact]
    public async Task RejectedProfileCanResubmitExistingDocumentsWithoutAutoApproval()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.SingleAsync();
        var reader = await db.UserProfiles.SingleAsync(x => x.Id == loan.ReaderId);
        reader.Status = AccountStatus.Rejected;
        var registration = new RegistrationRequest { UserId = reader.Id, Status = RegistrationRequestStatus.Rejected,
            DocumentType = DocumentType.NationalId, RejectReason = "Bổ sung địa chỉ", AttemptNo = 1,
            Documents = new[] { DocumentSide.Front, DocumentSide.Back, DocumentSide.Selfie }
                .Select(side => new IdentityDocument { Side = side, StoragePath = $"test://{side}", MimeType = "image/png", Sha256 = "test", SizeBytes = 1 }).ToList() };
        db.Add(registration); await db.SaveChangesAsync();
        var profiles = new UserProfileService(db, null!, null!, NullLogger<UserProfileService>.Instance);
        var controller = new ProfileController(profiles, null!, db) { ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([
                new Claim(ClaimTypes.NameIdentifier, reader.Id.ToString()), new Claim(ClaimTypes.Role, "Reader")
            ], "test")) }
        } };
        var response = await controller.Update(new() { FullName = reader.FullName, Address = "Địa chỉ đã bổ sung", SubmitForReview = true }, default);
        var result = Assert.IsType<OkObjectResult>(response);
        var profile = Assert.IsType<ApiResponse<UserProfileResponse>>(result.Value).Data!;
        Assert.Equal("PendingApproval", profile.AccountStatus);
        Assert.Equal("Submitted", profile.RegistrationStatus);
        Assert.False(profile.IsVerified);
        Assert.Equal(RegistrationRequestStatus.Submitted, registration.Status);
        Assert.Null(registration.RejectReason);
        Assert.Equal(3, await db.IdentityDocuments.CountAsync());
        Assert.False(await ReaderVerificationService.IsVerifiedAsync(db, reader.Id, default));
    }

    [BookCodePostgresFact]
    public async Task FeeSummaryAndFiltersSeparatePaidPendingWaivedAndServiceCharges()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.SingleAsync();
        Fine Fee(decimal amount, string reason, FineStatus status) => new()
        {
            BorrowRecordId = loan.Id, ReaderId = loan.ReaderId, Amount = amount, Reason = reason,
            Status = status, PaidAt = status == FineStatus.Paid ? DateTime.UtcNow : null
        };
        db.AddRange(
            Fee(10000, "Phạt quá hạn 2 ngày", FineStatus.Paid),
            Fee(20000, "Bồi thường hư hỏng", FineStatus.Pending),
            Fee(30000, "Bồi thường mất sách", FineStatus.Waived),
            Fee(4000, CirculationRules.BorrowServiceFeeReason, FineStatus.Paid),
            Fee(5000, CirculationRules.RenewalServiceFeeReason, FineStatus.Pending),
            Fee(6000, CirculationRules.BorrowServiceFeeReason, FineStatus.Waived));
        var deleted = Fee(999999, "Phạt quá hạn 1 ngày", FineStatus.Paid);
        deleted.IsDeleted = true; db.Add(deleted);
        await db.SaveChangesAsync();
        var repository = new CirculationRepository(db);
        var stats = await repository.GetStatsAsync(5000, default);
        Assert.Equal(14000, stats.TotalFines);
        Assert.Equal(25000, stats.UnpaidFines);
        Assert.Equal(10000, stats.Penalties.Paid);
        Assert.Equal(20000, stats.Penalties.Pending);
        Assert.Equal(30000, stats.Penalties.Waived);
        Assert.Equal(4000, stats.ServiceFees.Paid);
        Assert.Equal(5000, stats.ServiceFees.Pending);
        Assert.Equal(6000, stats.ServiceFees.Waived);
        var service = await repository.GetFinesAsync(null, null, default, feeType: "ServiceFee");
        Assert.Equal(3, service.Count); Assert.All(service, fee => Assert.Equal("ServiceFee", fee.FeeType));
        var waived = await repository.GetFinesAsync(null, "Waived", default, feeType: "Penalty");
        Assert.Single(waived); Assert.Equal(30000, waived[0].Amount);
    }

    [BookCodePostgresFact]
    public async Task PassingDeadlineMarksOverdueImmediatelyWithoutChargingSameDay()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.SingleAsync();
        loan.Status = BorrowStatus.Borrowed; loan.ReturnDate = null;
        loan.DueDate = DateTime.UtcNow.AddSeconds(-1);
        await db.SaveChangesAsync();
        var repository = new CirculationRepository(db);
        var marked = await repository.MarkOverdueAsync(default);
        Assert.Single(marked);
        var overdue = await repository.GetOverdueAsync(5000, default);
        Assert.Single(overdue); Assert.Equal("Overdue", overdue[0].DisplayStatus);
        Assert.Equal(0, overdue[0].OverdueDays); Assert.Null(overdue[0].SuggestedFine);
        Assert.Empty(await db.Fines.ToListAsync());
        db.ChangeTracker.Clear();
        loan = await db.BorrowRecords.SingleAsync();
        loan.Status = BorrowStatus.Borrowed; loan.DueDate = DateTime.UtcNow.AddMinutes(10);
        await db.SaveChangesAsync();
        Assert.Empty(await repository.MarkOverdueAsync(default));
    }

    [BookCodePostgresFact]
    public async Task CounterRenewalPreservesNoonDeadlineWithoutPickupAppointment()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.SingleAsync();
        loan.Status = BorrowStatus.Borrowed; loan.ReturnDate = null; loan.PickupAt = null;
        var due = DateTime.UtcNow.Date.AddDays(2).AddHours(5); // 12:00 Vietnam
        loan.DueDate = due;
        db.Add(new PolicyRule { Code = "RENEW", Name = "Gia hạn", Status = PolicyRuleStatus.Active,
            PolicyType = PolicyRuleType.Renewal, Parameters = [
                new() { ParamKey = "max_renewals", ParamValue = "2" },
                new() { ParamKey = "renewal_days", ParamValue = "7" }
            ] });
        await db.SaveChangesAsync();
        var result = await Service(db).RenewAsync(loan.Id, fixture.StaffId, byLibrarian: true);
        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal(due.AddDays(7), result.Data!.DueDate);
    }
}
