using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.IntegrationTests;

// Executes selected existing report cases at API level. Authentication/providers are doubles;
// this is not browser E2E or live-provider verification. Each test uses isolated synthetic data.
[Collection("Workflow database")]
public sealed class Report5PlannedTests(WorkflowFixture fixture)
{
    private async Task Denied(string role, string method, string path)
    {
        using var client = fixture.Client(role);
        using var message = new HttpRequestMessage(new HttpMethod(method), path);
        if (method != "GET") message.Content = JsonContent.Create(new { });
        using var response = await client.SendAsync(message);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact] public async Task ST_01_3_ReaderCannotApprove()
    {
        await using var db = fixture.Db();
        var request = new RegistrationRequest { UserId = await fixture.NewReaderAsync(), Status = RegistrationRequestStatus.Submitted };
        db.Add(request); await db.SaveChangesAsync();
        await Denied("Reader", "POST", $"/api/v1/registrations/{request.Id}/approve");
        await db.Entry(request).ReloadAsync();
        Assert.Equal(RegistrationRequestStatus.Submitted, request.Status);
    }

    [Fact] public async Task ST_02_3_ReaderCannotMutateInventory()
    {
        var book = await fixture.BookAsync();
        await Denied("Reader", "POST", "/api/v1/books");
        await Denied("Reader", "PUT", $"/api/v1/books/{book.BookId}");
        await Denied("Reader", "POST", "/api/v1/copies/intake");
        // Include the alternate form endpoint; authorization must not depend on content type.
        using var reader = fixture.Client("Reader");
        using var form = new MultipartFormDataContent();
        var code = "R5" + Guid.NewGuid().ToString("N")[..12];
        form.Add(new StringContent(code), "Code");
        form.Add(new StringContent("Unauthorized synthetic catalog entry"), "Title");
        form.Add(new StringContent("1"), "TotalCopies");
        using var response = await reader.PostAsync("/api/v1/books/form", form);
        await using var db = fixture.Db();
        var persisted = await db.Books.AnyAsync(x => x.Code == code);
        Assert.True(response.StatusCode == HttpStatusCode.Forbidden && !persisted,
            $"Reader form-create: HTTP {(int)response.StatusCode}; persisted={persisted}. Expected 403 and no new book.");
    }

    [Fact] public async Task ST_02_2_InvalidIntakeAndDuplicateCode()
    {
        var existing = new WorkflowTests(fixture);
        await existing.CopyIntake_InvalidQuantity_IsRejected(0);
        await existing.CopyIntake_InvalidQuantity_IsRejected(501);
        var book = await fixture.BookAsync();
        await using var db = fixture.Db();
        var code = (await db.Books.FindAsync(book.BookId))!.Code;
        using var staff = fixture.Client("Librarian");
        using var response = await staff.PostAsJsonAsync("/api/v1/books", new { code, title = "Duplicate test" });
        Assert.Contains(response.StatusCode, new[] { HttpStatusCode.BadRequest, HttpStatusCode.Conflict });
        Assert.Equal(1, await db.Books.CountAsync(x => x.Code == code));
        Assert.Equal(1, await db.BookCopies.CountAsync(x => x.BookId == book.BookId));
    }

    [Fact] public Task ST_03_1_BorrowAndHandover() => new WorkflowTests(fixture).Borrow_Approve_Handover_Return_PersistsLifecycle();
    [Fact] public async Task ST_03_2_PastSlotAndLastCopyRace()
    {
        var tests = new WorkflowTests(fixture);
        await tests.Borrow_PastPickupSlot_IsRejectedWithoutHoldingCopy();
        await tests.ConcurrentBorrow_LastCopy_OnlyOneRequestSucceeds();
    }
    [Fact] public async Task ST_03_3_StaffLoansAuthorization()
    {
        var tests = new WorkflowTests(fixture);
        await tests.ReaderOrAnonymous_CannotAccessStaffLoans(null,401);
        await tests.ReaderOrAnonymous_CannotAccessStaffLoans("Reader",403);
    }
    [Fact] public async Task ST_04_1_ReturnConditions()
    {
        var tests = new WorkflowTests(fixture);
        foreach (var condition in new[] { "Good", "Damaged", "Lost" })
            await tests.Return_OverdueCopy_CreatesFineOrIncident(condition);
    }
    [Fact] public Task ST_04_2_DuplicateReturn() => new WorkflowTests(fixture).Borrow_Approve_Handover_Return_PersistsLifecycle();
    [Fact] public Task ST_04_3_ReaderCannotReturn() => Denied("Reader","POST","/api/v1/circulation/return");

    [Fact] public async Task ST_05_3_CrossReaderRenewal()
    {
        var book = await fixture.BookAsync();
        var owner = await fixture.NewReaderAsync();
        await using var db = fixture.Db();
        var loan = new BorrowRecord { ReaderId=owner, BookCopyId=book.CopyId, Status=BorrowStatus.Borrowed,
            BorrowDate=DateTime.UtcNow.AddDays(-1), DueDate=DateTime.UtcNow.AddDays(10) };
        db.Add(loan); await db.SaveChangesAsync();
        var due=loan.DueDate;
        using var other=fixture.Client("Reader",await fixture.NewReaderAsync());
        using var response=await other.PostAsJsonAsync($"/api/v1/me/circulation/loans/{loan.Id}/renew",new {});
        Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
        await db.Entry(loan).ReloadAsync(); Assert.Equal(due,loan.DueDate); Assert.Equal(0,loan.RenewalCount);
    }
    [Fact] public async Task ST_06_3_CrossReaderReservation()
    {
        var book=await fixture.BookAsync();
        await using var db=fixture.Db();
        var reservation=new Reservation { BookId=book.BookId,ReaderId=await fixture.NewReaderAsync(),Status="pending" };
        db.Add(reservation);await db.SaveChangesAsync();
        using var other=fixture.Client("Reader",await fixture.NewReaderAsync());
        using var response=await other.PostAsJsonAsync($"/api/v1/me/circulation/reservations/{reservation.Id}/cancel",new {});
        Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
        await db.Entry(reservation).ReloadAsync();Assert.Equal("pending",reservation.Status);
    }
    [Fact] public Task ST_07_3_CrossReaderCheckout() => new WorkflowTests(fixture).Fine_Checkout_DifferentReader_IsDenied();
    [Fact] public async Task ST_08_3_PrivateReaderDetails()
    {
        var owner=await fixture.NewReaderAsync();
        await Denied("Reader","GET",$"/api/v1/readers/{owner}");
        await Denied("Reader","GET",$"/api/v1/librarian/users/{owner}");
    }

    private static async Task<Guid> ReviewId(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Created,response.StatusCode);
        var body=await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("data").GetProperty("id").GetGuid();
    }
    [Fact] public async Task ST_09_2_ReviewValidation()
    {
        var book=await fixture.BookAsync();using var reader=fixture.Client("Reader");
        var path=$"/api/v1/books/{book.BookId}/reviews";
        foreach(var rating in new[]{0,6})
        {
            using var invalid=await reader.PostAsJsonAsync(path,new {rating,comment="Invalid synthetic rating"});
            Assert.Equal(HttpStatusCode.BadRequest,invalid.StatusCode);
        }
        using var created=await reader.PostAsJsonAsync(path,new {rating=4,comment="Synthetic review"});
        await ReviewId(created);
        using var duplicate=await reader.PostAsJsonAsync(path,new {rating=5,comment="Duplicate"});
        Assert.Equal(HttpStatusCode.Conflict,duplicate.StatusCode);
        await using var db=fixture.Db();
        Assert.Equal(1,await db.Reviews.CountAsync(x=>x.BookId==book.BookId&&!x.IsDeleted));
        Assert.Equal(4m,(await db.Books.FindAsync(book.BookId))!.AverageRating);
    }
    [Fact] public async Task ST_09_3_ReviewOwnership()
    {
        var book=await fixture.BookAsync();using var owner=fixture.Client("Reader");
        var path=$"/api/v1/books/{book.BookId}/reviews";
        using var created=await owner.PostAsJsonAsync(path,new {rating=4,comment="Owner review"});
        var id=await ReviewId(created);
        using var other=fixture.Client("Reader",await fixture.NewReaderAsync());
        using var response=await other.PutAsJsonAsync(path+"/"+id,new {rating=1,comment="Other reader"});
        Assert.Equal(HttpStatusCode.NotFound,response.StatusCode);
        await using var db=fixture.Db();var saved=await db.Reviews.FindAsync(id);
        Assert.Equal(4,saved!.Rating);Assert.Equal("Owner review",saved.Comment);
    }
    [Fact] public async Task ST_10_2_InvalidSupportContent()
    {
        using var reader=fixture.Client("Reader",await fixture.NewReaderAsync());
        using var form=new MultipartFormDataContent();form.Add(new StringContent(""),"Content");
        form.Add(new StringContent(Guid.NewGuid().ToString()),"RequestTypeId");
        using var response=await reader.PostAsync("/api/v1/support/complaints",form);
        Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
        // Nonexistent request-type ID with otherwise valid content must also be rejected.
        using var invalid=new MultipartFormDataContent();invalid.Add(new StringContent("Synthetic request with invalid type"),"Content");
        invalid.Add(new StringContent(Guid.NewGuid().ToString()),"RequestTypeId");
        using var missing=await reader.PostAsync("/api/v1/support/complaints",invalid);
        Assert.Equal(HttpStatusCode.BadRequest,missing.StatusCode);
    }
    [Fact] public Task ST_10_3_PrivateConversation() => Denied("Reader","GET",$"/api/v1/support/chat/conversations/{fixture.ReaderId}/messages");
    [Fact] public async Task ST_11_3_NewsAndNotificationOwnership()
    {
        using var reader=fixture.Client("Reader");using var form=new MultipartFormDataContent();
        form.Add(new StringContent("Forbidden announcement"),"Title");
        using var publish=await reader.PostAsync("/api/v1/news/form",form);
        Assert.Equal(HttpStatusCode.Forbidden,publish.StatusCode);
        await using var db=fixture.Db();
        var note=new Notification {UserId=await fixture.NewReaderAsync(),Title="Private test",Message="Owner only",Type="test"};
        db.Add(note);await db.SaveChangesAsync();
        using var list=await reader.GetAsync("/api/v1/notifications");
        Assert.True(list.IsSuccessStatusCode);
        Assert.DoesNotContain(note.Id.ToString(),await list.Content.ReadAsStringAsync());
        using var read=await reader.PostAsJsonAsync($"/api/v1/notifications/{note.Id}/read",new {});
        Assert.Equal(HttpStatusCode.NotFound,read.StatusCode);
        await db.Entry(note).ReloadAsync();Assert.False(note.IsRead);
    }
    [Fact] public async Task ST_12_3_AdminUsersAuthorization()
    {
        foreach(var role in new[]{"Reader","Librarian"}) await Denied(role,"GET","/api/v1/admin/users");
    }
    [Fact] public async Task ST_13_3_AdminPolicyAuthorization()
    {
        foreach(var role in new[]{"Reader","Librarian"})
        { await Denied(role,"POST","/api/v1/policy-rules");await Denied(role,"POST","/api/v1/regulations"); }
    }
    [Fact] public Task ST_14_3_AiSettingsAuthorization() => Denied("Reader","GET","/api/v1/ai/settings");
    [Fact] public Task ST_15_3_AiAnalyticsAuthorization() => Denied("Reader","GET","/api/v1/ai/reading-trends");
    [Fact] public async Task ST_16_3_ReportAuthorization()
    {
        await Denied("Reader","GET","/api/admin/reports");
        await Denied("Reader","GET","/api/admin/reports/export");
        await Denied("Reader","GET","/api/librarian/reports");
    }
    [Fact] public async Task SM_04_RegistrationLifecycle()
    {
        var tests=new WorkflowTests(fixture);
        await tests.Registration_Approve_ActivatesExternalReader_AndRejectAfterApprovalFails();
        await tests.Registration_Reject_PersistsReasonAndAccountState();
        await tests.Registration_MoreInfo_ResubmissionCreatesNewRequest();
        await tests.Registration_ApprovedRequest_CannotBeReopenedForDocuments();
    }
}
