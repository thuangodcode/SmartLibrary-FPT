using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace SmartLibrary.Api.Hubs;

[Authorize]
public sealed class NotificationHub : Hub
{
    public const string LibrarianGroup = "notifications:librarians";
    public static string UserGroup(Guid userId) => $"notifications:user:{userId:N}";

    public override async Task OnConnectedAsync()
    {
        var rawId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? Context.User?.FindFirstValue("sub");
        if (!Guid.TryParse(rawId, out var userId) || userId == Guid.Empty)
            throw new HubException("Không xác định được tài khoản.");
        await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId));
        if (Context.User?.IsInRole("Librarian") == true || Context.User?.IsInRole("Admin") == true)
            await Groups.AddToGroupAsync(Context.ConnectionId, LibrarianGroup);
        await base.OnConnectedAsync();
    }
}
