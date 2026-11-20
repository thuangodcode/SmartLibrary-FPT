using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Api.Controllers;
using SmartLibrary.Api.Hubs;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.News.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.IntegrationTests;

public sealed partial class CopyLifecycleTests
{
    private static ControllerContext ActingAs(Guid id, string role) => new()
    {
        HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, id.ToString()), new Claim(ClaimTypes.Role, role)
        ], "test")) }
    };

    [BookCodePostgresFact]
    public async Task ReaderCanAnswerOnlyOwnAwaitingComplaintAndStaffAssignmentIsPreserved()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var reader = await db.UserProfiles.SingleAsync(x => x.Id != fixture.StaffId);
        reader.StudentId = "TEST123";
        var complaint = new SupportComplaint { ReaderId = reader.Id, RequestType = new() { Name = "Bổ sung kiểm thử" },
            Content = "Đơn kiểm thử", AcceptedById = fixture.StaffId, Status = "InProgress" };
        db.Add(complaint); await db.SaveChangesAsync();
        var controller = new SupportController(db, null!, new SilentSupportHub()) { ControllerContext = ActingAs(fixture.StaffId, "Librarian") };
        Assert.IsType<OkObjectResult>(await controller.RequestComplaintInfo(complaint.Id, new("Bổ sung mã phiếu"), default));
        db.ChangeTracker.Clear();
        Assert.Equal("AwaitingReader", (await db.SupportComplaints.SingleAsync()).Status);
        controller.ControllerContext = ActingAs(reader.Id, "Reader");
        Assert.IsType<OkObjectResult>(await controller.ReplyToComplaint(complaint.Id, new("Mã phiếu kiểm thử"), default));
        db.ChangeTracker.Clear();
        var saved = await db.SupportComplaints.Include(x => x.Replies).SingleAsync();
        Assert.Equal("InProgress", saved.Status);
        Assert.Equal(fixture.StaffId, saved.AcceptedById);
        Assert.Equal(2, saved.Replies.Count);
        Assert.IsType<ConflictObjectResult>(await controller.ReplyToComplaint(complaint.Id, new("Không gửi lại khi không còn chờ"), default));
        Assert.Equal(2, await db.SupportComplaintReplies.CountAsync());
    }

    [BookCodePostgresFact]
    public async Task HiddenNewsCommentsArePrivateAndStaffCannotRewriteReaderContent()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var reader = await db.UserProfiles.SingleAsync(x => x.Id != fixture.StaffId);
        var article = new NewsArticle { Title = "Tin kiểm thử" };
        var comment = new NewsComment { NewsArticle = article, AuthorId = reader.Id, Content = "Nội dung gốc", IsDeleted = true };
        db.Add(comment); await db.SaveChangesAsync();
        var controller = new NewsController(db, null!, new SilentSupportHub()) { ControllerContext = ActingAs(reader.Id, "Reader") };
        var response = Assert.IsType<OkObjectResult>(await controller.GetComments(article.Id));
        var visible = Assert.IsType<ApiResponse<IReadOnlyList<NewsCommentDto>>>(response.Value).Data!;
        Assert.Empty(visible);
        controller.ControllerContext = ActingAs(fixture.StaffId, "Librarian");
        Assert.IsType<BadRequestObjectResult>(controller.UpdateComment(article.Id, comment.Id, new("Nội dung thủ thư định sửa")));
        Assert.Equal("Nội dung gốc", (await db.NewsComments.SingleAsync()).Content);
        Assert.IsType<NoContentResult>(await controller.RestoreComment(article.Id, comment.Id));
        controller.ControllerContext = ActingAs(reader.Id, "Reader");
        response = Assert.IsType<OkObjectResult>(await controller.GetComments(article.Id));
        Assert.Single(Assert.IsType<ApiResponse<IReadOnlyList<NewsCommentDto>>>(response.Value).Data!);
    }

    [BookCodePostgresFact]
    public async Task ShelfLocationsExposeAssignedCategories()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var shelf = await db.StorageShelves.SingleAsync(x => x.Name == fixture.ShelfA);
        var category = new Category { Name = "Danh mục kiểm thử", Code = "TST" };
        db.Add(category); await db.SaveChangesAsync();
        db.Add(new StorageShelfCategory { ShelfId = shelf.Id, CategoryId = category.Id });
        await db.SaveChangesAsync();
        var result = Assert.IsType<OkObjectResult>(await new BookCopiesController(db).GetLocations());
        var rows = JsonSerializer.SerializeToElement(Assert.IsType<ApiResponse<object>>(result.Value).Data);
        var row = rows.EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == shelf.Id);
        Assert.Equal(category.Id, row.GetProperty("categoryIds")[0].GetGuid());
        Assert.Equal(category.Name, row.GetProperty("categories")[0].GetString());
    }

    private sealed class SilentSupportHub : IHubContext<SupportChatHub>
    {
        public IHubClients Clients { get; } = new SilentClients();
        public IGroupManager Groups => throw new NotSupportedException();
    }

    private sealed class SilentClients : IHubClients, IClientProxy
    {
        public IClientProxy All => this;
        public IClientProxy AllExcept(IReadOnlyList<string> ids) => this;
        public IClientProxy Client(string id) => this;
        public IClientProxy Clients(IReadOnlyList<string> ids) => this;
        public IClientProxy Group(string name) => this;
        public IClientProxy GroupExcept(string name, IReadOnlyList<string> ids) => this;
        public IClientProxy Groups(IReadOnlyList<string> names) => this;
        public IClientProxy User(string id) => this;
        public IClientProxy Users(IReadOnlyList<string> ids) => this;
        public Task SendCoreAsync(string method, object?[] args, CancellationToken ct = default) => Task.CompletedTask;
    }
}
