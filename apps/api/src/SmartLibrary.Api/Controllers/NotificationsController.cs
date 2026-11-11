using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Notifications;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly INotificationInbox _inbox;

    public NotificationsController(INotificationInbox inbox) => _inbox = inbox;

    [HttpGet]
    public async Task<IActionResult> ListMine(
        [FromQuery] int? page, [FromQuery] int pageSize = 10, CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        if (!page.HasValue)
        {
            var items = await _inbox.ListMineAsync(userId, ct);
            return Ok(ApiResponse<IReadOnlyList<InboxNotificationDto>>.Ok(items));
        }

        var result = await _inbox.ListMineAsync(userId, page.Value, pageSize, ct);
        return Ok(ApiResponse<InboxNotificationPageDto>.Ok(result));
    }

    [HttpGet("unread-count")]
    public async Task<IActionResult> UnreadCount(CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));
        return Ok(ApiResponse<object>.Ok(new { unreadCount = await _inbox.CountUnreadAsync(userId, ct) }));
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var ok = await _inbox.MarkReadAsync(userId, id, ct);
        if (!ok)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy thông báo."));

        return Ok(ApiResponse<object>.Ok(true, new { message = "Đã đánh dấu đã đọc." }));
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));
        var count = await _inbox.MarkAllReadAsync(userId, ct);
        return Ok(ApiResponse<object>.Ok(new { count }, new { message = "Đã đánh dấu tất cả thông báo là đã đọc." }));
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                    ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(value, out userId) && userId != Guid.Empty;
    }
}
