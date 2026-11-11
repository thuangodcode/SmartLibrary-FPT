using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.Hubs;

[Authorize(Roles = "Reader,Librarian,Admin")]
public sealed class SupportChatHub(AppDbContext db) : Hub
{
    public const string LibrarianGroup = "support:librarians";

    public static string ReaderGroup(Guid readerId) => $"support:reader:{readerId:N}";

    public override async Task OnConnectedAsync()
    {
        var id = GetUserId();
        if (Context.User?.IsInRole("Reader") == true)
            await Groups.AddToGroupAsync(Context.ConnectionId, ReaderGroup(id));
        if (Context.User?.IsInRole("Librarian") == true || Context.User?.IsInRole("Admin") == true)
            await Groups.AddToGroupAsync(Context.ConnectionId, LibrarianGroup);
        await base.OnConnectedAsync();
    }

    public async Task JoinConversation(Guid readerId)
    {
        if (Context.User?.IsInRole("Librarian") != true && Context.User?.IsInRole("Admin") != true)
            throw new HubException("Bạn không có quyền mở cuộc trò chuyện này.");
        if (!await db.UserProfiles.AnyAsync(x => x.Id == readerId && x.Role.Name == "Reader", Context.ConnectionAborted))
            throw new HubException("Không tìm thấy độc giả.");
        await Groups.AddToGroupAsync(Context.ConnectionId, ReaderGroup(readerId), Context.ConnectionAborted);
    }

    public Task LeaveConversation(Guid readerId)
        => Groups.RemoveFromGroupAsync(Context.ConnectionId, ReaderGroup(readerId), Context.ConnectionAborted);

    public Task SendMessage(string message)
    {
        if (Context.User?.IsInRole("Reader") != true)
            throw new HubException("Chỉ độc giả mới có thể gửi tin nhắn theo phiên này.");
        return SaveAndBroadcastAsync(GetUserId(), message);
    }

    public Task SendReply(Guid readerId, string message)
    {
        if (Context.User?.IsInRole("Librarian") != true && Context.User?.IsInRole("Admin") != true)
            throw new HubException("Bạn không có quyền phản hồi cuộc trò chuyện.");
        return SaveAndBroadcastAsync(readerId, message);
    }

    private async Task SaveAndBroadcastAsync(Guid readerId, string rawMessage)
    {
        var message = rawMessage?.Trim() ?? string.Empty;
        if (message.Length is < 1 or > 2000)
            throw new HubException("Tin nhắn phải có từ 1 đến 2000 ký tự.");

        var senderId = GetUserId();
        var sender = await db.UserProfiles.AsNoTracking()
            .Where(x => x.Id == senderId)
            .Select(x => new { x.Id, x.FullName, x.Role.Name })
            .FirstOrDefaultAsync(Context.ConnectionAborted);
        if (sender is null)
            throw new HubException("Không tìm thấy hồ sơ người gửi.");
        if (!await db.UserProfiles.AnyAsync(x => x.Id == readerId && x.Role.Name == "Reader", Context.ConnectionAborted))
            throw new HubException("Không tìm thấy độc giả.");

        var row = new SupportChatMessage
        {
            ReaderId = readerId,
            SenderId = senderId,
            Message = message,
            IsReadByLibrarian = sender.Id != readerId,
            IsReadByReader = sender.Id == readerId
        };
        db.SupportChatMessages.Add(row);
        await db.SaveChangesAsync(Context.ConnectionAborted);

        var dto = new SupportChatMessageDto(
            row.Id,
            readerId,
            sender.Id,
            sender.FullName,
            sender.Name,
            message,
            row.CreatedAt);
        await Clients.Group(ReaderGroup(readerId))
            .SendAsync("ReceiveChatMessage", dto, Context.ConnectionAborted);
        await Clients.Group(LibrarianGroup)
            .SendAsync("ConversationUpdated", new { readerId, lastMessage = message, createdAt = row.CreatedAt }, Context.ConnectionAborted);
    }

    private Guid GetUserId()
    {
        var rawId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(rawId, out var id))
            return id;
        throw new HubException("Không xác định được tài khoản.");
    }
}

public sealed record SupportChatMessageDto(
    Guid Id,
    Guid ReaderId,
    Guid SenderId,
    string SenderName,
    string SenderRole,
    string Message,
    DateTime CreatedAt);
