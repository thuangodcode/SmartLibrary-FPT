using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.IntegrationTests;

// API + disposable PostgreSQL only. No live identity/payment/email/provider claims.
[Collection("Workflow database")]
public sealed class Report5AdditionalTests(WorkflowFixture fixture)
{
    private static async Task<JsonElement> Ok(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"HTTP {(int)response.StatusCode}: {body}");
        return JsonDocument.Parse(body).RootElement.GetProperty("data").Clone();
    }
    private static MultipartFormDataContent Form(params (string Key, string Value)[] fields)
    {
        var form = new MultipartFormDataContent();
        foreach (var (key,value) in fields) form.Add(new StringContent(value), key);
        return form;
    }
    private async Task<BorrowRecord> Loan(Guid reader, int days = 1, int renewals = 0)
    {
        var book = await fixture.BookAsync();
        await using var db = fixture.Db();
        (await db.BookCopies.FindAsync(book.CopyId))!.IsAvailable = false;
        (await db.Books.FindAsync(book.BookId))!.AvailableCopies = 0;
        var loan = new BorrowRecord { ReaderId=reader, BookCopyId=book.CopyId,
            Status=BorrowStatus.Borrowed, BorrowDate=DateTime.UtcNow.AddDays(-10),
            DueDate=DateTime.UtcNow.Date.AddDays(days), RenewalCount=renewals };
        db.Add(loan); await db.SaveChangesAsync(); return loan;
    }

    [Fact] public async Task ST_01_2_MismatchedConfirmation()
    {
        using var client=fixture.Client("Reader");
        await using var db=fixture.Db();
        var count=await db.UserProfiles.CountAsync();
        var secret=Guid.NewGuid().ToString("N");
        var response=await client.PostAsJsonAsync("/api/v1/auth/register",new {
            email=$"{Guid.NewGuid():N}@example.test",password=secret,confirmPassword=secret+"x",fullName="Synthetic registration" });
        Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
        Assert.Equal(count,await db.UserProfiles.CountAsync());
    }

    [Fact] public async Task ST_02_1_CatalogCreateIntakeSearchDetail()
    {
        using var staff=fixture.Client("Librarian"); using var reader=fixture.Client("Reader");
        var code="R5"+Guid.NewGuid().ToString("N")[..12];
        var data=await Ok(await staff.PostAsJsonAsync("/api/v1/books",new {code,title=code,language="vi"}));
        var id=data.GetProperty("id").GetGuid();
        await Ok(await staff.PostAsJsonAsync("/api/v1/copies/intake",new {bookId=id,quantity=2,condition="Good",location="R5-A1"}));
        var search=await Ok(await reader.GetAsync($"/api/v1/books?search={code}"));
        Assert.Contains(search.EnumerateArray(),x=>x.GetProperty("id").GetGuid()==id);
        Assert.Equal(id,(await Ok(await reader.GetAsync($"/api/v1/books/{id}"))).GetProperty("id").GetGuid());
        await using var db=fixture.Db();
        var copies=await db.BookCopies.Where(x=>x.BookId==id).ToListAsync();
        Assert.Equal(2,copies.Count); Assert.Equal(2,copies.Select(x=>x.Barcode).Distinct().Count());
        Assert.All(copies,x=>{Assert.Equal("R5-A1",x.Location);Assert.True(x.IsAvailable);});
        var book=await db.Books.FindAsync(id);Assert.Equal(2,book!.TotalCopies);Assert.Equal(2,book.AvailableCopies);
    }

    [Fact] public async Task ST_05_1_ReaderAndLibrarianRenewal()
    {
        var owner=await fixture.NewReaderAsync();var loan=await Loan(owner);
        using var reader=fixture.Client("Reader",owner);using var staff=fixture.Client("Librarian");
        var due=loan.DueDate!.Value;
        await Ok(await reader.PostAsJsonAsync($"/api/v1/me/circulation/loans/{loan.Id}/renew",new {}));
        await using var db=fixture.Db();var saved=await db.BorrowRecords.FindAsync(loan.Id);
        Assert.Equal(due.AddDays(7),saved!.DueDate);Assert.Equal(1,saved.RenewalCount);
        await Ok(await staff.PostAsJsonAsync($"/api/v1/circulation/loans/{loan.Id}/renew",new {}));
        await db.Entry(saved).ReloadAsync();Assert.Equal(due.AddDays(14),saved.DueDate);Assert.Equal(2,saved.RenewalCount);
        Assert.Equal(fixture.LibrarianId,saved.LibrarianId);
    }

    [Fact] public async Task ST_05_2_RenewalLimitOverdueAndQueue()
    {
        foreach(var branch in new[]{"limit","overdue","queue"})
        {
            var owner=await fixture.NewReaderAsync();var loan=await Loan(owner,branch=="overdue"?-2:1,branch=="limit"?2:0);
            await using var db=fixture.Db();
            if(branch=="queue") {var copy=await db.BookCopies.FindAsync(loan.BookCopyId);
                db.Add(new Reservation{ReaderId=await fixture.NewReaderAsync(),BookId=copy!.BookId,Status="pending"});await db.SaveChangesAsync();}
            using var reader=fixture.Client("Reader",owner);
            var response=await reader.PostAsJsonAsync($"/api/v1/me/circulation/loans/{loan.Id}/renew",new {});
            Assert.True(response.StatusCode==HttpStatusCode.BadRequest,$"{branch}: HTTP {(int)response.StatusCode}");
            var saved=await db.BorrowRecords.FindAsync(loan.Id);Assert.Equal(loan.DueDate,saved!.DueDate);Assert.Equal(loan.RenewalCount,saved.RenewalCount);
        }
    }

    [Fact] public async Task ST_06_1_ReservationReturnAndPickup()
    {
        var loan=await Loan(await fixture.NewReaderAsync());var owner=await fixture.NewReaderAsync();
        await using var db=fixture.Db();var copy=(await db.BookCopies.FindAsync(loan.BookCopyId))!;
        using var reader=fixture.Client("Reader",owner);using var staff=fixture.Client("Librarian");
        var reserved=await Ok(await reader.PostAsJsonAsync("/api/v1/me/circulation/book-reservations",new {bookId=copy.BookId}));
        var rid=reserved.GetProperty("id").GetGuid();
        Assert.Equal("pending",(await db.Reservations.FindAsync(rid))!.Status);
        await Ok(await staff.PostAsJsonAsync("/api/v1/circulation/return",new {barcode=copy.Barcode,condition="Good"}));
        db.ChangeTracker.Clear();Assert.Equal("ready",(await db.Reservations.FindAsync(rid))!.Status);
        var slot=CirculationRules.PickupSlots(new CirculationSettings(),DateTimeOffset.UtcNow)[0].PickupAt;
        var request=await Ok(await reader.PostAsJsonAsync("/api/v1/me/circulation/book-requests",new {bookId=copy.BookId,pickupAt=slot}));
        var id=request.GetProperty("id").GetGuid();
        await Ok(await staff.PostAsJsonAsync($"/api/v1/circulation/loans/{id}/approve",new {}));
        await Ok(await staff.PostAsJsonAsync($"/api/v1/circulation/loans/{id}/checkout",new {}));
        db.ChangeTracker.Clear();var reservation=await db.Reservations.FindAsync(rid);
        Assert.Equal("fulfilled",reservation!.Status);Assert.NotNull(reservation.FulfilledAt);
        Assert.Equal(BorrowStatus.Borrowed,(await db.BorrowRecords.FindAsync(id))!.Status);
        Assert.False((await db.BookCopies.FindAsync(copy.Id))!.IsAvailable);
    }

    [Fact] public async Task ST_06_2_DuplicateAndExpiredReadyHold()
    {
        var loan=await Loan(await fixture.NewReaderAsync());var owner=await fixture.NewReaderAsync();
        await using var db=fixture.Db();var copy=(await db.BookCopies.FindAsync(loan.BookCopyId))!;
        using var reader=fixture.Client("Reader",owner);using var staff=fixture.Client("Librarian");
        var reserved=await Ok(await reader.PostAsJsonAsync("/api/v1/me/circulation/book-reservations",new {bookId=copy.BookId}));
        var rid=reserved.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest,(await reader.PostAsJsonAsync("/api/v1/me/circulation/book-reservations",new {bookId=copy.BookId})).StatusCode);
        await Ok(await staff.PostAsJsonAsync("/api/v1/circulation/return",new {barcode=copy.Barcode,condition="Good"}));
        db.ChangeTracker.Clear();var hold=(await db.Reservations.FindAsync(rid))!;Assert.Equal("ready",hold.Status);
        hold.ExpiresAt=DateTime.UtcNow.AddMinutes(-1);await db.SaveChangesAsync();
        await Ok(await reader.GetAsync("/api/v1/me/circulation/reservations"));
        await Ok(await reader.GetAsync("/api/v1/me/circulation/reservations"));
        db.ChangeTracker.Clear();Assert.Equal("expired",(await db.Reservations.FindAsync(rid))!.Status);
        Assert.Equal(1,await db.Reservations.CountAsync(x=>x.BookId==copy.BookId));
        Assert.True((await db.BookCopies.FindAsync(copy.Id))!.IsAvailable);
        Assert.Equal(1,(await db.Books.FindAsync(copy.BookId))!.AvailableCopies);
    }

    [Fact] public async Task ST_08_1_ProfileEditAndStaffHistory()
    {
        var owner=await fixture.NewReaderAsync();var loan=await Loan(owner);
        using var reader=fixture.Client("Reader",owner);using var staff=fixture.Client("Librarian");
        using var form=Form(("FullName","Updated synthetic reader"),("Phone","0901234567"),("Address","Test address"));
        await Ok(await reader.PutAsync("/api/v1/profile",form));
        var profile=await Ok(await reader.GetAsync("/api/v1/profile"));Assert.Equal("Updated synthetic reader",profile.GetProperty("fullName").GetString());
        var history=await Ok(await staff.GetAsync($"/api/v1/readers/{owner}"));
        Assert.Equal(owner,history.GetProperty("id").GetGuid());Assert.Equal(1,history.GetProperty("borrowCount").GetInt32());
        Assert.Equal(1,history.GetProperty("activeBorrowCount").GetInt32());
        await using var db=fixture.Db();var saved=await db.UserProfiles.FindAsync(owner);
        Assert.Equal("0901234567",saved!.Phone);Assert.Equal("Test address",saved.Address);
    }

    [Fact] public async Task ST_08_2_InvalidContactPreservesProfile()
    {
        var owner=await fixture.NewReaderAsync();using var reader=fixture.Client("Reader",owner);
        await using var db=fixture.Db();var original=(await db.UserProfiles.FindAsync(owner))!;
        var name=original.FullName;var phone=original.Phone;
        using var form=Form(("FullName","Must not persist"),("Phone",new string('9',31)));
        Assert.Equal(HttpStatusCode.BadRequest,(await reader.PutAsync("/api/v1/profile",form)).StatusCode);
        await db.Entry(original).ReloadAsync();Assert.Equal(name,original.FullName);Assert.Equal(phone,original.Phone);
    }

    [Fact] public async Task ST_09_1_ReviewCreateEditDeleteAggregates()
    {
        var owner=await fixture.NewReaderAsync();var loan=await Loan(owner);
        await using var db=fixture.Db();var copy=(await db.BookCopies.FindAsync(loan.BookCopyId))!;
        var stored=(await db.BorrowRecords.FindAsync(loan.Id))!;stored.Status=BorrowStatus.Returned;stored.ReturnDate=DateTime.UtcNow;await db.SaveChangesAsync();
        using var reader=fixture.Client("Reader",owner);var route=$"/api/v1/books/{copy.BookId}/reviews";
        var review=await Ok(await reader.PostAsJsonAsync(route,new {rating=4,comment="Synthetic review"}));var id=review.GetProperty("id").GetGuid();
        Assert.Equal(4m,(await db.Books.AsNoTracking().SingleAsync(x=>x.Id==copy.BookId)).AverageRating);
        await Ok(await reader.PutAsJsonAsync(route+"/"+id,new {rating=2,comment="Updated review"}));
        Assert.Equal(2m,(await db.Books.AsNoTracking().SingleAsync(x=>x.Id==copy.BookId)).AverageRating);
        Assert.Equal(owner,(await db.Reviews.AsNoTracking().SingleAsync(x=>x.Id==id)).ReaderId);
        Assert.Equal(HttpStatusCode.NoContent,(await reader.DeleteAsync(route+"/"+id)).StatusCode);
        Assert.False(await db.Reviews.AnyAsync(x=>x.Id==id&&!x.IsDeleted));
        Assert.Equal(0m,(await db.Books.AsNoTracking().SingleAsync(x=>x.Id==copy.BookId)).AverageRating);
    }

    [Fact] public async Task ST_10_1_SupportReplyAndHistory()
    {
        var owner=await fixture.NewReaderAsync();await using var db=fixture.Db();
        var type=new SupportRequestType{Name="Synthetic support "+Guid.NewGuid()};db.Add(type);await db.SaveChangesAsync();
        using var reader=fixture.Client("Reader",owner);using var staff=fixture.Client("Librarian");
        using var form=Form(("Content","Synthetic support request for integration test"),("RequestTypeId",type.Id.ToString()));
        var complaint=await Ok(await reader.PostAsync("/api/v1/support/complaints",form));var id=complaint.GetProperty("id").GetGuid();
        await Ok(await staff.PostAsJsonAsync($"/api/v1/support/complaints/{id}/replies",new {message="Synthetic staff response"}));
        var history=await Ok(await reader.GetAsync("/api/v1/support/complaints/mine"));Assert.Contains("Synthetic staff response",history.ToString());
        var saved=await db.SupportComplaints.AsNoTracking().SingleAsync(x=>x.Id==id);
        Assert.Equal(owner,saved.ReaderId);Assert.Equal("InProgress",saved.Status);Assert.Equal(fixture.LibrarianId,saved.AcceptedById);
        Assert.Equal(1,await db.SupportComplaintReplies.CountAsync(x=>x.ComplaintId==id));
    }

    [Fact] public async Task ST_10_2_InvalidContentAndConversationNoOrphans()
    {
        using var reader=fixture.Client("Reader");using var staff=fixture.Client("Librarian");await using var db=fixture.Db();
        var complaints=await db.SupportComplaints.CountAsync();var replies=await db.SupportComplaintReplies.CountAsync();var messages=await db.SupportChatMessages.CountAsync();
        using var form=Form(("Content",""),("RequestTypeId",Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.BadRequest,(await reader.PostAsync("/api/v1/support/complaints",form)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await staff.GetAsync($"/api/v1/support/chat/conversations/{Guid.NewGuid()}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await staff.PostAsJsonAsync($"/api/v1/support/complaints/{Guid.NewGuid()}/replies",new {message="No orphan reply"})).StatusCode);
        Assert.Equal(complaints,await db.SupportComplaints.CountAsync());Assert.Equal(replies,await db.SupportComplaintReplies.CountAsync());Assert.Equal(messages,await db.SupportChatMessages.CountAsync());
    }

    [Fact] public async Task ST_11_2_MissingNotificationDoesNotMutateInbox()
    {
        var owner=await fixture.NewReaderAsync();await using var db=fixture.Db();
        var notification=new Notification{UserId=owner,Title="Synthetic",Message="Unchanged",Type="test"};db.Add(notification);await db.SaveChangesAsync();
        using var reader=fixture.Client("Reader",owner);
        Assert.Equal(HttpStatusCode.NotFound,(await reader.PostAsJsonAsync($"/api/v1/notifications/{Guid.NewGuid()}/read",new {})).StatusCode);
        await db.Entry(notification).ReloadAsync();Assert.False(notification.IsRead);Assert.Equal(1,await db.Notifications.CountAsync(x=>x.UserId==owner));
    }

    [Fact] public async Task ST_12_2_DuplicateLibrarianAccount()
    {
        var owner=await fixture.NewReaderAsync();var username="r5"+Guid.NewGuid().ToString("N")[..12];await using var db=fixture.Db();
        var profile=(await db.UserProfiles.FindAsync(owner))!;profile.Email=username+"@smartlibrary.local";await db.SaveChangesAsync();
        var count=await db.UserProfiles.CountAsync();using var admin=fixture.Client("Admin");
        var response=await admin.PostAsJsonAsync("/api/v1/admin/users/librarians",new {fullName="Synthetic librarian",employeeId="R5"+Guid.NewGuid().ToString("N")[..12],username,password=Guid.NewGuid().ToString("N")});
        Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);Assert.Equal(count,await db.UserProfiles.CountAsync());
        await db.Entry(profile).ReloadAsync();Assert.Equal(fixture.ReaderRoleId,profile.RoleId);
    }

    [Fact] public async Task ST_13_2_InvalidPolicyKeepsLastValidSettings()
    {
        using var admin=fixture.Client("Admin");await using var db=fixture.Db();
        var before=await db.PolicyRules.AsNoTracking().CountAsync();
        foreach(var item in new[]{("FineFee","overdue_fee_per_day","-1"),("BorrowDuration","max_days","0")})
        {
            var response=await admin.PostAsJsonAsync("/api/v1/policy-rules",new {name="Invalid synthetic policy",policyType=item.Item1,status="Active",parameters=new[]{new {key=item.Item2,value=item.Item3}}});
            Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
        }
        Assert.Equal(before,await db.PolicyRules.CountAsync());
        Assert.Contains(await db.PolicyRuleParameters.ToListAsync(),x=>x.ParamKey=="max_days"&&x.ParamValue=="14");
        Assert.Contains(await db.PolicyRuleParameters.ToListAsync(),x=>x.ParamKey=="overdue_fee_per_day"&&x.ParamValue=="5000");
    }

    [Fact] public async Task ST_14_2_MissingProviderCredential()
    {
        // Implemented credential owner is Librarian, not Admin; no provider call is made.
        using var staff=fixture.Client("Librarian");
        var response=await staff.PutAsJsonAsync("/api/v1/ai/my-settings",new {provider="openai",chatModel="gpt-4o-mini"});
        Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
        var body=await response.Content.ReadAsStringAsync();Assert.Contains("API Key",body);
        var status=await Ok(await staff.GetAsync("/api/v1/ai/settings"));
        Assert.False(status.GetProperty("hasApiKey").GetBoolean());
        Assert.True(!status.TryGetProperty("apiKey",out var key)||key.ValueKind==JsonValueKind.Null||string.IsNullOrEmpty(key.GetString()));
    }

    [Fact] public async Task ST_16_2_InvalidReportPeriod()
    {
        using var admin=fixture.Client("Admin");await using var db=fixture.Db();
        var before=await db.ReportRequests.CountAsync();var day=DateTime.UtcNow.Date;
        var response=await admin.PostAsJsonAsync("/api/admin/reports/requests",new {librarianId=fixture.LibrarianId,templateId=Guid.NewGuid(),periodStart=day,periodEnd=day.AddDays(-1),name="Invalid period"});
        Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);Assert.Equal(before,await db.ReportRequests.CountAsync());
    }
}
