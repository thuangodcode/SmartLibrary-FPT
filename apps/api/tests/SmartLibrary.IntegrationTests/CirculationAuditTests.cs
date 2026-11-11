using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Api.Controllers;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Infrastructure.Persistence.Repositories;

namespace SmartLibrary.IntegrationTests;

public sealed partial class CopyLifecycleTests
{
    [BookCodePostgresFact]
    public async Task UnreturnedOverdueLoanCannotFinalizeAFine()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.SingleAsync();
        loan.Status = BorrowStatus.Overdue; loan.ReturnDate = null; loan.DueDate = DateTime.UtcNow.AddDays(-3);
        await db.SaveChangesAsync();
        var result = await Service(db).RecordFineAsync(new() { BorrowRecordId = loan.Id });
        Assert.False(result.IsSuccess);
        Assert.Contains("chỉ được chốt", result.Error);
        Assert.Empty(await db.Fines.ToListAsync());
    }

    [BookCodePostgresFact]
    public async Task RecordingHistoricalFineStopsAtReturnDateAndConcurrentCallsDoNotDuplicate()
    {
        await using var fixture = await Fixture.CreateAsync();
        var returnedAt = DateTime.UtcNow.AddDays(-3);
        await using (var db = fixture.Context())
        {
            var loan = await db.BorrowRecords.SingleAsync();
            loan.DueDate = returnedAt.AddDays(-2); loan.ReturnDate = returnedAt;
            await db.SaveChangesAsync();
        }
        async Task<bool> Record()
        {
            await using var db = fixture.Context();
            return (await Service(db).RecordFineAsync(new() { BorrowRecordId = fixture.LoanId })).IsSuccess;
        }
        Assert.Single(await Task.WhenAll(Record(), Record()), success => success);
        await using var verify = fixture.Context();
        Assert.Equal(10000m, (await verify.Fines.SingleAsync()).Amount);
    }

    [BookCodePostgresFact]
    public async Task ReaderToLibrarianCyclePreservesLightDamageAndKeepsFeesIndependentOfShelving()
    {
        await using var fixture = await Fixture.CreateAsync();
        Guid readerId; Guid bookId;
        await using (var db = fixture.Context())
        {
            db.BookIncidents.RemoveRange(db.BookIncidents); db.BorrowRecords.RemoveRange(db.BorrowRecords); db.Reservations.RemoveRange(db.Reservations);
            var copy = await db.BookCopies.Include(item => item.Book).SingleAsync();
            copy.Condition = BookCondition.Good; copy.IsAvailable = true; copy.Location = fixture.ShelfA; copy.Book.AvailableCopies = 1;
            readerId = (await db.UserProfiles.SingleAsync(item => item.Id != fixture.StaffId)).Id; bookId = copy.BookId;
            AddBorrowPolicies(db);
            await db.SaveChangesAsync();
        }
        Guid loanId;
        await using (var db = fixture.Context())
        {
            var service = Service(db);
            var slot = (await service.GetPickupSlotsAsync()).First();
            var request = await service.RequestBorrowBookAsync(readerId, bookId, slot.PickupAt);
            Assert.True(request.IsSuccess, request.Error); loanId = request.Data!.Id;
            Assert.Equal("Pending", request.Data.Status);
            Assert.Equal(0, (await db.Books.AsNoTracking().SingleAsync()).AvailableCopies);
            Assert.False((await service.RequestBorrowBookAsync(readerId, bookId, slot.PickupAt)).IsSuccess);
            Assert.True((await service.ApproveAsync(loanId, fixture.StaffId)).IsSuccess);
            Assert.False((await service.CompleteCheckoutAsync(loanId, fixture.StaffId, barcode: "WRONG-01")).IsSuccess);
            Assert.True((await service.CompleteCheckoutAsync(loanId, fixture.StaffId, barcode: "TEST001-01")).IsSuccess);
            var returned = await service.ReturnAsync(new() { Barcode = "TEST001-01", LoanId = loanId, Condition = "Damaged", Notes = "Xước bìa sau, kiểm tra ruột sách nguyên vẹn." }, fixture.StaffId);
            Assert.True(returned.IsSuccess, returned.Error);
            Assert.True(returned.Data!.IncidentOpened);
            Assert.False((await service.ReturnAsync(new() { Barcode = "TEST001-01", LoanId = loanId, Condition = "Good" }, fixture.StaffId)).IsSuccess);
        }
        await using (var db = fixture.Context())
        {
            var service = Service(db); var incident = await db.BookIncidents.SingleAsync();
            Assert.True((await service.ConfirmIncidentAsync(incident.Id, new() { Severity = "Light", Notes = "Xác minh chỉ xước bìa, còn dùng được." }, fixture.StaffId)).IsSuccess);
            Assert.IsType<OkObjectResult>(await new BookCopiesController(db).TransferLocations(new([new(fixture.CopyId, fixture.ShelfA)]), service));
            Assert.Equal(1, (await db.Books.SingleAsync()).AvailableCopies);
            var slot = (await service.GetPickupSlotsAsync()).First();
            Assert.False((await service.RequestBorrowBookAsync(readerId, bookId, slot.PickupAt)).IsSuccess);
            Assert.True((await service.PayFineAsync((await db.Fines.SingleAsync()).Id, fixture.StaffId)).IsSuccess);
            var second = await service.RequestBorrowBookAsync(readerId, bookId, slot.PickupAt);
            Assert.True(second.IsSuccess, second.Error);
            Assert.True((await service.ApproveAsync(second.Data!.Id, fixture.StaffId)).IsSuccess);
            Assert.True((await service.CompleteCheckoutAsync(second.Data.Id, fixture.StaffId, barcode: "TEST001-01")).IsSuccess);
            Assert.False((await service.ReturnAsync(new() { Barcode = "TEST001-01", LoanId = loanId, Condition = "LightDamaged" }, fixture.StaffId)).IsSuccess);
            Assert.False((await service.ReturnAsync(new() { Barcode = "TEST001-01", LoanId = second.Data.Id, Condition = "Good" }, fixture.StaffId)).IsSuccess);
            var returned = await service.ReturnAsync(new() { Barcode = "TEST001-01", LoanId = second.Data.Id, Condition = "LightDamaged", Notes = "Không phát sinh hư hỏng mới." }, fixture.StaffId);
            Assert.True(returned.IsSuccess, returned.Error);
            Assert.False(returned.Data!.IncidentOpened);
            Assert.Single(await db.Fines.ToListAsync()); Assert.Single(await db.BookIncidents.ToListAsync());
            Assert.Equal(BookCondition.LightDamaged, (await db.BookCopies.SingleAsync()).Condition);
            Assert.Null((await db.BookCopies.SingleAsync()).Location);
        }
    }

    [BookCodePostgresFact]
    public async Task LostCopyRemainsUnavailableAfterCashPaymentUntilFoundAndInspected()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var incident = await db.BookIncidents.SingleAsync(); incident.Kind = BookIncidentKind.Lost;
        (await db.BookCopies.SingleAsync()).Condition = BookCondition.Lost;
        await db.SaveChangesAsync();
        var service = Service(db);
        Assert.True((await service.ConfirmIncidentAsync(incident.Id, new() { Severity = "Lost", Notes = "Đã xác minh thất lạc." }, fixture.StaffId)).IsSuccess);
        Assert.True((await service.PayFineAsync((await db.Fines.SingleAsync()).Id, fixture.StaffId)).IsSuccess);
        Assert.Equal(BookCondition.Lost, (await db.BookCopies.SingleAsync()).Condition);
        Assert.IsType<ConflictObjectResult>(await new BookCopiesController(db).TransferLocations(new([new(fixture.CopyId, fixture.ShelfA)]), service));
        Assert.False((await service.RestoreIncidentCopyAsync(incident.Id, new() { Condition = "Good", Notes = "" }, fixture.StaffId)).IsSuccess);
        Assert.True((await service.RestoreIncidentCopyAsync(incident.Id, new() { Condition = "Good", Notes = "Đã tìm thấy sách và kiểm tra đủ trang." }, fixture.StaffId)).IsSuccess);
        Assert.Null((await db.BookCopies.SingleAsync()).Location);
        Assert.IsType<OkObjectResult>(await new BookCopiesController(db).TransferLocations(new([new(fixture.CopyId, fixture.ShelfA)]), service));
        Assert.Equal(FineStatus.Paid, (await db.Fines.SingleAsync()).Status);
    }

    [BookCodePostgresFact]
    public async Task RepeatedConcurrentCashConfirmationCreatesOneReceipt()
    {
        await using var fixture = await Fixture.CreateAsync(); Guid fineId;
        await using (var db = fixture.Context())
        {
            Assert.True((await Service(db).ConfirmIncidentAsync(fixture.IncidentId, new() { Severity = "Light", Notes = "Hư nhẹ." }, fixture.StaffId)).IsSuccess);
            fineId = (await db.Fines.SingleAsync()).Id;
        }
        async Task<bool> Pay()
        {
            await using var db = fixture.Context(); return (await Service(db).PayFineAsync(fineId, fixture.StaffId)).IsSuccess;
        }
        Assert.All(await Task.WhenAll(Pay(), Pay()), success => Assert.True(success));
        await using var verify = fixture.Context();
        Assert.Single(await verify.FinePayments.ToListAsync());
        Assert.Equal(BookIncidentStatus.Resolved, (await verify.BookIncidents.SingleAsync()).Status);
        Assert.Equal(BookCondition.LightDamaged, (await verify.BookCopies.SingleAsync()).Condition);
    }

    [BookCodePostgresFact]
    public async Task ExistingOverdueFineIsNotShownAsANewChargeAndRemainsLinkedToIncident()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.SingleAsync(); loan.DueDate = DateTime.UtcNow.AddDays(-3); loan.ReturnDate = DateTime.UtcNow;
        var overdue = new Fine { BorrowRecordId = loan.Id, ReaderId = loan.ReaderId, Amount = 15000, Reason = "Phạt quá hạn 3 ngày", Status = FineStatus.Pending };
        db.Add(overdue); await db.SaveChangesAsync();
        var service = Service(db);
        var preview = await service.GetIncidentAsync(fixture.IncidentId);
        Assert.True(preview!.HasRecordedOverdueFine);
        Assert.Null(preview.SuggestedOverdueFine);
        var confirm = await service.ConfirmIncidentAsync(fixture.IncidentId, new() { Severity = "Light", ApplyOverdue = true, Notes = "Hư nhẹ, phí quá hạn đã có trước." }, fixture.StaffId);
        Assert.True(confirm.IsSuccess, confirm.Error); Assert.Equal(2, await db.Fines.CountAsync());
        var incident = await db.BookIncidents.SingleAsync();
        Assert.Equal(overdue.Id, incident.OverdueFineId);
        Assert.True((await service.PayFineAsync(incident.CompensationFineId!.Value, fixture.StaffId)).IsSuccess);
        Assert.Equal(BookIncidentStatus.CompensationPending, incident.Status);
        Assert.True((await service.PayFineAsync(overdue.Id, fixture.StaffId)).IsSuccess);
        Assert.Equal(BookIncidentStatus.Resolved, incident.Status);
    }

    [BookCodePostgresFact]
    public async Task RejectedAndExpiredRequestsReturnToWarehouseWithoutInventingALoanOrFee()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using (var db = fixture.Context())
        {
            db.BookIncidents.RemoveRange(db.BookIncidents);
            var loan = await db.BorrowRecords.SingleAsync(); loan.Status = BorrowStatus.Pending; loan.ReturnDate = null; loan.BorrowDate = null; loan.DueDate = null; loan.PickupAt = DateTime.UtcNow.AddHours(1);
            (await db.BookCopies.SingleAsync()).Condition = BookCondition.Good;
            await db.SaveChangesAsync();
            Assert.True((await Service(db).RejectAsync(loan.Id, notes: "Độc giả đổi lịch, huỷ yêu cầu.")).IsSuccess);
            Assert.False((await Service(db).CompleteCheckoutAsync(loan.Id, fixture.StaffId, barcode: "TEST001-01")).IsSuccess);
            Assert.Null((await db.BookCopies.SingleAsync()).Location);
            Assert.True((await db.BookCopies.SingleAsync()).IsAvailable);
            Assert.Equal(0, (await db.Books.SingleAsync()).AvailableCopies);
        }
        await using (var db = fixture.Context())
        {
            var copy = await db.BookCopies.SingleAsync(); copy.IsAvailable = false;
            var readerId = (await db.BorrowRecords.SingleAsync()).ReaderId;
            db.Add(new BorrowRecord { BookCopyId = copy.Id, ReaderId = readerId, Status = BorrowStatus.Approved, PickupAt = DateTime.UtcNow.AddDays(-3) });
            await db.SaveChangesAsync();
            Assert.Single(await Service(db).ExpireUncollectedPickupsAsync());
            Assert.Empty(await Service(db).ExpireUncollectedPickupsAsync());
            Assert.True(copy.IsAvailable); Assert.Null(copy.Location);
            Assert.Empty(await db.Fines.ToListAsync());
        }
    }

    [BookCodePostgresFact]
    public async Task ReaderReportMustBeResolvedOrRecordedOnReturnAndDoesNotEndTheLoanItself()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        db.BookIncidents.RemoveRange(db.BookIncidents);
        var loan = await db.BorrowRecords.SingleAsync(); loan.Status = BorrowStatus.Borrowed; loan.ReturnDate = null;
        (await db.BookCopies.SingleAsync()).Condition = BookCondition.Good;
        await db.SaveChangesAsync();
        var service = Service(db);
        var reported = await service.ReportIncidentAsync(loan.ReaderId, loan.Id, new() { Kind = "Damage", Notes = "Phát hiện bìa rách khi đang mượn." });
        Assert.True(reported.IsSuccess, reported.Error);
        Assert.Equal(BorrowStatus.Borrowed, loan.Status); Assert.Null(loan.ReturnDate);
        Assert.False((await service.ConfirmIncidentAsync(reported.Data!.Id, new() { Severity = "Light" }, fixture.StaffId)).IsSuccess);
        Assert.False((await service.ReturnAsync(new() { Barcode = "TEST001-01", LoanId = loan.Id, Condition = "Good" }, fixture.StaffId)).IsSuccess);
        Assert.True((await service.RejectIncidentAsync(reported.Data.Id, new() { Notes = "Đối chiếu: chỉ là vết in trên bìa, sách không rách." }, fixture.StaffId)).IsSuccess);
        Assert.True((await service.ReturnAsync(new() { Barcode = "TEST001-01", LoanId = loan.Id, Condition = "Good" }, fixture.StaffId)).IsSuccess);
        Assert.Empty(await db.Fines.ToListAsync());
    }

    [BookCodePostgresFact]
    public async Task RenewalHonorsOtherReadersReservationAndConfiguredOverdueBlock()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        db.BookIncidents.RemoveRange(db.BookIncidents);
        var loan = await db.BorrowRecords.SingleAsync(); loan.Status = BorrowStatus.Borrowed; loan.ReturnDate = null; loan.DueDate = DateTime.UtcNow.AddDays(1);
        var reservation = await db.Reservations.SingleAsync(); reservation.ReaderId = fixture.StaffId;
        db.Add(new PolicyRule { Code = "AUDIT-RENEW", Name = "Gia hạn audit", PolicyType = PolicyRuleType.Renewal, Status = PolicyRuleStatus.Active, Parameters = [new() { ParamKey = "max_renewals", ParamValue = "1" }, new() { ParamKey = "renewal_days", ParamValue = "7" }, new() { ParamKey = "block_if_overdue", ParamValue = "true" }, new() { ParamKey = "block_if_reserved", ParamValue = "true" }] });
        await db.SaveChangesAsync();
        var service = Service(db);
        Assert.False((await service.RenewAsync(loan.Id, fixture.StaffId, byLibrarian: false)).IsSuccess);
        Assert.False((await service.RenewAsync(loan.Id, fixture.StaffId, byLibrarian: true)).IsSuccess);
        db.Reservations.Remove(reservation); loan.DueDate = DateTime.UtcNow.AddDays(-1); await db.SaveChangesAsync();
        Assert.False((await service.RenewAsync(loan.Id, fixture.StaffId, byLibrarian: true)).IsSuccess);
        loan.DueDate = DateTime.UtcNow.AddDays(1); await db.SaveChangesAsync();
        var oldDue = loan.DueDate;
        Assert.True((await service.RenewAsync(loan.Id, fixture.StaffId, byLibrarian: true)).IsSuccess);
        Assert.Equal(oldDue!.Value.AddDays(7), loan.DueDate);
        Assert.False((await service.RenewAsync(loan.Id, fixture.StaffId, byLibrarian: true)).IsSuccess);
        Assert.Equal(1, loan.RenewalCount);
    }

    static void AddBorrowPolicies(AppDbContext db)
    {
        db.Add(new PolicyRule { Code = "AUDIT-DAYS", Name = "Thời hạn audit", PolicyType = PolicyRuleType.BorrowDuration, Status = PolicyRuleStatus.Active, Parameters = [new() { ParamKey = "max_days", ParamValue = "7" }] });
        db.Add(new PolicyRule { Code = "AUDIT-LIMIT", Name = "Giới hạn audit", PolicyType = PolicyRuleType.BorrowLimit, Status = PolicyRuleStatus.Active, Parameters = [new() { ParamKey = "max_books", ParamValue = "5" }] });
    }

    [BookCodePostgresFact]
    public async Task RepeatedReaderReportsCannotOpenTwoIncidentsOnTheSameLoan()
    {
        await using var fixture = await Fixture.CreateAsync(); Guid readerId;
        await using (var db = fixture.Context())
        {
            db.BookIncidents.RemoveRange(db.BookIncidents);
            var loan = await db.BorrowRecords.SingleAsync(); readerId = loan.ReaderId;
            loan.Status = BorrowStatus.Borrowed; loan.ReturnDate = null;
            await db.SaveChangesAsync();
        }
        async Task<bool> Report()
        {
            await using var db = fixture.Context();
            return (await Service(db).ReportIncidentAsync(readerId, fixture.LoanId, new() { Kind = "Lost", Notes = "Độc giả chưa tìm thấy sách." })).IsSuccess;
        }
        Assert.Single(await Task.WhenAll(Report(), Report()), success => success);
        await using var verify = fixture.Context();
        Assert.Single(await verify.BookIncidents.ToListAsync());
        Assert.Empty(await verify.Fines.ToListAsync());
        Assert.Equal(BorrowStatus.Borrowed, (await verify.BorrowRecords.SingleAsync()).Status);
    }

    [BookCodePostgresFact]
    public async Task ReturningAReportedCopyAndAssessingItConcurrentlyDoNotDeadlockOrChargeTwice()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using (var db = fixture.Context())
        {
            var loan = await db.BorrowRecords.SingleAsync(); loan.Status = BorrowStatus.Borrowed; loan.ReturnDate = null;
            (await db.BookCopies.SingleAsync()).Condition = BookCondition.Good;
            await db.SaveChangesAsync();
        }
        await using var returningDb = fixture.Context(); await using var assessingDb = fixture.Context();
        var returned = Service(returningDb).ReturnAsync(new() { Barcode = "TEST001-01", LoanId = fixture.LoanId, Condition = "Damaged", Notes = "Đối chiếu báo cáo: xước bìa." }, fixture.StaffId);
        var assessed = Service(assessingDb).ConfirmIncidentAsync(fixture.IncidentId, new() { Severity = "Light", Notes = "Kiểm tra ruột sách nguyên vẹn." }, fixture.StaffId);
        await Task.WhenAll(returned, assessed).WaitAsync(TimeSpan.FromSeconds(15));
        Assert.True((await returned).IsSuccess);
        await using var verify = fixture.Context();
        if (!(await assessed).IsSuccess)
            Assert.True((await Service(verify).ConfirmIncidentAsync(fixture.IncidentId, new() { Severity = "Light", Notes = "Xác minh lại sau khi nhận trả." }, fixture.StaffId)).IsSuccess);
        Assert.Single(await verify.Fines.ToListAsync()); Assert.Single(await verify.BookIncidents.ToListAsync());
        Assert.Equal(BookCondition.LightDamaged, (await verify.BookCopies.SingleAsync()).Condition);
    }
}
