using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.IntegrationTests;

[Collection("Workflow database")]
public sealed class WorkflowTests(WorkflowFixture fixture)
{
    private static async Task<JsonElement> Success(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"HTTP {(int)response.StatusCode}: {body}");
        return JsonDocument.Parse(body).RootElement.Clone();
    }

    [Fact]
    public async Task Borrow_Approve_Handover_Return_PersistsLifecycle()
    {
        var book = await fixture.BookAsync();
        using var reader = fixture.Client("Reader", await fixture.NewReaderAsync());
        using var librarian = fixture.Client("Librarian");
        var slot = CirculationRules.PickupSlots(new CirculationSettings(), DateTimeOffset.UtcNow)[0].PickupAt;
        var created = await Success(await reader.PostAsJsonAsync("/api/v1/me/circulation/book-requests", new { bookId = book.BookId, pickupAt = slot }));
        var id = created.GetProperty("data").GetProperty("id").GetGuid();
        await using (var db = fixture.Db())
        {
            var loan = await db.BorrowRecords.FindAsync(id);
            Assert.Equal(BorrowStatus.Pending, loan!.Status);
            Assert.Null(loan.BorrowDate);
            Assert.False((await db.BookCopies.FindAsync(book.CopyId))!.IsAvailable);
        }
        await Success(await librarian.PostAsJsonAsync($"/api/v1/circulation/loans/{id}/approve", new { }));
        await using (var db = fixture.Db())
        {
            var loan = await db.BorrowRecords.FindAsync(id);
            Assert.Equal(BorrowStatus.Approved, loan!.Status);
            Assert.Null(loan.BorrowDate);
        }
        await Success(await librarian.PostAsJsonAsync($"/api/v1/circulation/loans/{id}/checkout", new { }));
        await using (var db = fixture.Db())
        {
            var loan = await db.BorrowRecords.FindAsync(id);
            Assert.Equal(BorrowStatus.Borrowed, loan!.Status);
            Assert.NotNull(loan.BorrowDate);
            Assert.True(loan.DueDate > loan.BorrowDate);
        }
        await Success(await librarian.PostAsJsonAsync("/api/v1/circulation/return", new { barcode = book.Barcode, condition = "Good" }));
        await using (var db = fixture.Db())
        {
            Assert.Equal(BorrowStatus.Returned, (await db.BorrowRecords.FindAsync(id))!.Status);
            Assert.True((await db.BookCopies.FindAsync(book.CopyId))!.IsAvailable);
            Assert.Equal(1, (await db.Books.FindAsync(book.BookId))!.AvailableCopies);
        }
        var duplicate = await librarian.PostAsJsonAsync("/api/v1/circulation/return", new { barcode = book.Barcode, condition = "Good" });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
    }

    [Theory]
    [InlineData(null, 401)]
    [InlineData("Reader", 403)]
    public async Task ReaderOrAnonymous_CannotAccessStaffLoans(string? role, int expected)
    {
        using var client = fixture.Client(role);
        var response = await client.GetAsync("/api/v1/circulation/loans");
        Assert.Equal(expected, (int)response.StatusCode);
    }

    [Fact]
    public async Task Borrow_PastPickupSlot_IsRejectedWithoutHoldingCopy()
    {
        var book = await fixture.BookAsync();
        using var client = fixture.Client("Reader");
        var response = await client.PostAsJsonAsync("/api/v1/me/circulation/book-requests", new { bookId = book.BookId, pickupAt = DateTimeOffset.UtcNow.AddDays(-1) });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await using var db = fixture.Db();
        Assert.True((await db.BookCopies.FindAsync(book.CopyId))!.IsAvailable);
        Assert.False(await db.BorrowRecords.AnyAsync(x => x.BookCopyId == book.CopyId));
    }

    [Fact]
    public async Task ConcurrentBorrow_LastCopy_OnlyOneRequestSucceeds()
    {
        var book = await fixture.BookAsync();
        using var first = fixture.Client("Reader", await fixture.NewReaderAsync());
        using var second = fixture.Client("Reader", await fixture.NewReaderAsync());
        var slot = CirculationRules.PickupSlots(new CirculationSettings(), DateTimeOffset.UtcNow)[1].PickupAt;
        var payload = new { bookId = book.BookId, pickupAt = slot };
        var responses = await Task.WhenAll(first.PostAsJsonAsync("/api/v1/me/circulation/book-requests", payload), second.PostAsJsonAsync("/api/v1/me/circulation/book-requests", payload));
        Assert.Single(responses, x => x.IsSuccessStatusCode);
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.BadRequest);
        await using var db = fixture.Db();
        Assert.Equal(1, await db.BorrowRecords.CountAsync(x => x.BookCopyId == book.CopyId));
        Assert.Equal(0, (await db.Books.FindAsync(book.BookId))!.AvailableCopies);
    }

    private async Task<Guid> Registration()
    {
        await using var db = fixture.Db();
        var user = new UserProfile { RoleId = fixture.ReaderRoleId, FullName = "New Reader", Email = Guid.NewGuid() + "@example.test", Status = AccountStatus.PendingApproval };
        var request = new RegistrationRequest { User = user, Status = RegistrationRequestStatus.Submitted };
        db.Add(request);
        await db.SaveChangesAsync();
        return request.Id;
    }

    [Fact]
    public async Task Registration_Approve_ActivatesExternalReader_AndRejectAfterApprovalFails()
    {
        var id = await Registration();
        using var client = fixture.Client("Librarian");
        await Success(await client.PostAsJsonAsync($"/api/v1/registrations/{id}/approve", new { note = "Verified test documents" }));
        await using var db = fixture.Db();
        var request = await db.RegistrationRequests.Include(x => x.User).SingleAsync(x => x.Id == id);
        Assert.Equal(RegistrationRequestStatus.Approved, request.Status);
        Assert.Equal(AccountStatus.Active, request.User.Status);
        Assert.Equal(ReaderType.External, request.User.ReaderType);
        Assert.True(request.User.MembershipExpiresAt > DateTime.UtcNow);
        var invalid = await client.PostAsJsonAsync($"/api/v1/registrations/{id}/reject", new { reason = "Too late" });
        Assert.False(invalid.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Registration_Reject_PersistsReasonAndAccountState()
    {
        var id = await Registration();
        using var client = fixture.Client("Librarian");
        await Success(await client.PostAsJsonAsync($"/api/v1/registrations/{id}/reject", new { reason = "Unreadable identity document" }));
        await using var db = fixture.Db();
        var request = await db.RegistrationRequests.Include(x => x.User).SingleAsync(x => x.Id == id);
        Assert.Equal(RegistrationRequestStatus.Rejected, request.Status);
        Assert.Equal(AccountStatus.Rejected, request.User.Status);
        Assert.Equal("Unreadable identity document", request.RejectReason);
    }

    [Fact]
    public async Task Registration_MoreInfo_ResubmissionCreatesNewRequest()
    {
        var id = await Registration();
        using var staff = fixture.Client("Librarian");
        await Success(await staff.PostAsJsonAsync($"/api/v1/registrations/{id}/request-more-info", new { reason = "Provide front document" }));
        Guid userId;
        await using (var db = fixture.Db()) { userId = (await db.RegistrationRequests.FindAsync(id))!.UserId; }
        using var reader = fixture.Client("Reader", userId);
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("0"), "DocumentType");
        form.Add(new ByteArrayContent(new byte[] { 1, 2, 3 }), "Front", "front.png");
        await Success(await reader.PostAsync("/api/v1/me/verification/documents", form));
        await using (var db = fixture.Db())
        {
            var requests = await db.RegistrationRequests.Where(x => x.UserId == userId).ToListAsync();
            Assert.Equal(2, requests.Count);
            Assert.Equal(RegistrationRequestStatus.NeedMoreInfo, requests.Single(x => x.Id == id).Status);
            Assert.Single(requests, x => x.Status == RegistrationRequestStatus.Submitted);
            Assert.Equal(AccountStatus.PendingApproval, (await db.UserProfiles.FindAsync(userId))!.Status);
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(501)]
    public async Task CopyIntake_InvalidQuantity_IsRejected(int quantity)
    {
        var book = await fixture.BookAsync();
        using var client = fixture.Client("Librarian");
        var response = await client.PostAsJsonAsync("/api/v1/copies/intake", new { bookId = book.BookId, quantity, condition = "Good", location = "TEST-A1" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CopyIntake_UpdatesCountAndDistinctBarcodes()
    {
        var book = await fixture.BookAsync();
        using var client = fixture.Client("Librarian");
        await Success(await client.PostAsJsonAsync("/api/v1/copies/intake", new { bookId = book.BookId, quantity = 2, condition = "Good", location = "TEST-A1" }));
        await using var db = fixture.Db();
        var copies = await db.BookCopies.Where(x => x.BookId == book.BookId).ToListAsync();
        Assert.Equal(3, copies.Count);
        Assert.Equal(3, copies.Select(x => x.Barcode).Distinct().Count());
        Assert.Equal(2, copies.Count(x => x.Location == "TEST-A1"));
        var saved = await db.Books.FindAsync(book.BookId);
        Assert.Equal(3, saved!.AvailableCopies);
        Assert.Equal(3, saved.TotalCopies);
    }

    private async Task<Guid> Fine()
    {
        var book = await fixture.BookAsync();
        await using var db = fixture.Db();
        var loan = new BorrowRecord { ReaderId = fixture.ReaderId, BookCopyId = book.CopyId, Status = BorrowStatus.Returned };
        var fine = new Fine { BorrowRecord = loan, ReaderId = fixture.ReaderId, Amount = 10000, Status = FineStatus.Pending, Reason = "Test overdue fee" };
        db.Add(fine);
        await db.SaveChangesAsync();
        return fine.Id;
    }

    [Fact]
    public async Task PayOS_Checkout_DuplicateWebhook_SettlesExactlyOnce()
    {
        var id = await Fine();
        using var reader = fixture.Client("Reader");
        await Success(await reader.PostAsJsonAsync($"/api/v1/me/circulation/fines/{id}/pay/payos", new { }));
        FinePayment payment;
        await using (var db = fixture.Db()) { payment = await db.FinePayments.SingleAsync(x => x.FineId == id); }
        var webhook = new { code = "00", description = "Success", success = true, signature = "test-double-signature", data = new { orderCode = payment.OrderCode, amount = 10000, paymentLinkId = payment.PaymentLinkId, currency = "VND", code = "00", description = "Test", reference = "test-reference" } };
        using var provider = fixture.Client();
        await Success(await provider.PostAsJsonAsync("/api/v1/payments/payos/webhook", webhook));
        await Success(await provider.PostAsJsonAsync("/api/v1/payments/payos/webhook", webhook));
        await using (var db = fixture.Db())
        {
            Assert.Equal(FineStatus.Paid, (await db.Fines.FindAsync(id))!.Status);
            Assert.Equal(FinePaymentStatus.Paid, (await db.FinePayments.FindAsync(payment.Id))!.Status);
            Assert.Equal(1, await db.FinePayments.CountAsync(x => x.FineId == id));
        }
    }

    [Fact]
    public async Task Fine_CashSettlement_CancelsPendingCheckout()
    {
        var id = await Fine();
        using var reader = fixture.Client("Reader");
        using var staff = fixture.Client("Librarian");
        await Success(await reader.PostAsJsonAsync($"/api/v1/me/circulation/fines/{id}/pay/payos", new { }));
        await Success(await staff.PostAsJsonAsync($"/api/v1/circulation/fines/{id}/pay/cash", new { }));
        await using var db = fixture.Db();
        Assert.Equal(FineStatus.Paid, (await db.Fines.FindAsync(id))!.Status);
        var payments = await db.FinePayments.Where(x => x.FineId == id).ToListAsync();
        Assert.Equal(FinePaymentStatus.Cancelled, payments.Single(x => x.Method == "PayOS").Status);
        Assert.Equal(FinePaymentStatus.Paid, payments.Single(x => x.Method == "Cash").Status);
    }

    [Fact]
    public async Task Fine_Checkout_DifferentReader_IsDenied()
    {
        var id = await Fine();
        using var reader = fixture.Client("Reader", Guid.NewGuid());
        var response = await reader.PostAsJsonAsync($"/api/v1/me/circulation/fines/{id}/pay/payos", new { });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await using var db = fixture.Db();
        Assert.False(await db.FinePayments.AnyAsync(x => x.FineId == id));
    }

    [Theory]
    [InlineData("Good")]
    [InlineData("Damaged")]
    [InlineData("Lost")]
    public async Task Return_OverdueCopy_CreatesFineOrIncident(string condition)
    {
        var book = await fixture.BookAsync();
        Guid loanId;
        var due = DateTime.UtcNow.AddDays(-3);
        await using (var db = fixture.Db())
        {
            var copy = (await db.BookCopies.Include(x => x.Book).SingleAsync(x => x.Id == book.CopyId));
            copy.IsAvailable = false;
            copy.Book.AvailableCopies = 0;
            var loan = new BorrowRecord { ReaderId = fixture.ReaderId, BookCopyId = book.CopyId,
                Status = BorrowStatus.Overdue, BorrowDate = due.AddDays(-14), DueDate = due };
            db.Add(loan);
            await db.SaveChangesAsync();
            loanId = loan.Id;
        }
        using var staff = fixture.Client("Librarian");
        await Success(await staff.PostAsJsonAsync("/api/v1/circulation/return", new { barcode = book.Barcode, condition }));
        await using var saved = fixture.Db();
        Assert.Equal(BorrowStatus.Returned, (await saved.BorrowRecords.FindAsync(loanId))!.Status);
        if (condition == "Good")
        {
            var fine = await saved.Fines.SingleAsync(x => x.BorrowRecordId == loanId);
            Assert.Equal(CirculationRules.CalendarOverdueDays(due, DateTime.UtcNow) * 5000m, fine.Amount);
            Assert.True((await saved.BookCopies.FindAsync(book.CopyId))!.IsAvailable);
        }
        else
        {
            Assert.Equal(BookIncidentStatus.PendingReview, (await saved.BookIncidents.SingleAsync(x => x.BorrowRecordId == loanId)).Status);
            Assert.False((await saved.BookCopies.FindAsync(book.CopyId))!.IsAvailable);
            Assert.False(await saved.Fines.AnyAsync(x => x.BorrowRecordId == loanId));
        }
    }

    [Fact]
    public async Task Registration_ApprovedRequest_CannotBeReopenedForDocuments()
    {
        var id = await Registration();
        using var staff = fixture.Client("Librarian");
        await Success(await staff.PostAsJsonAsync($"/api/v1/registrations/{id}/approve", new { }));
        var response = await staff.PostAsJsonAsync($"/api/v1/registrations/{id}/request-more-info", new { reason = "Stale review tab" });
        Assert.False(response.IsSuccessStatusCode, "An approved request must not be downgraded by a stale review action.");
        await using var db = fixture.Db();
        Assert.Equal(RegistrationRequestStatus.Approved, (await db.RegistrationRequests.FindAsync(id))!.Status);
    }
}
