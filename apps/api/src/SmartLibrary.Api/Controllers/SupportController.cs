using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Api.Hubs;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/support")]
public sealed class SupportController(
    AppDbContext db,
    IStorageService storage,
    IHubContext<SupportChatHub> chatHub) : ControllerBase
{
    private const long MaximumAttachmentSize = 10 * 1024 * 1024;

    [HttpGet("request-types")]
    public async Task<IActionResult> GetRequestTypes(CancellationToken ct)
    {
        var rows = await db.SupportRequestTypes.AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.Name)
            .Select(x => new SupportRequestTypeDto(x.Id, x.Name))
            .ToListAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<SupportRequestTypeDto>>.Ok(rows));
    }

    [HttpGet("chat/messages")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> GetMyChatMessages(CancellationToken ct)
    {
        if (!TryGetUserId(out var readerId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));
        var rows = await GetChatMessagesAsync(readerId, ct);
        return Ok(ApiResponse<IReadOnlyList<SupportChatMessageDto>>.Ok(rows));
    }

    [HttpGet("complaints/mine")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> GetMyComplaints(CancellationToken ct)
    {
        if (!TryGetUserId(out var readerId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));
        var rows = await db.SupportComplaints.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.RequestType)
            .Include(x => x.AcceptedBy)
            .Include(x => x.Replies).ThenInclude(x => x.Sender).ThenInclude(x => x.Role)
            .Where(x => x.ReaderId == readerId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(100)
            .ToListAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<SupportComplaintDto>>.Ok(rows.Select(MapComplaint).ToList()));
    }

    [HttpPost("complaints")]
    [Authorize(Roles = "Reader")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaximumAttachmentSize + 1024 * 1024)]
    public async Task<IActionResult> CreateComplaint([FromForm] CreateSupportComplaintForm form, CancellationToken ct)
    {
        if (!TryGetUserId(out var readerId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));
        var content = form.Content?.Trim() ?? string.Empty;
        if (content.Length is < 10 or > 5000)
            return BadRequest(ApiResponse<object>.Fail("Nội dung đơn phải có từ 10 đến 5000 ký tự."));

        var requestType = await db.SupportRequestTypes.FirstOrDefaultAsync(
            x => x.Id == form.RequestTypeId && x.IsActive,
            ct);
        if (requestType is null)
            return BadRequest(ApiResponse<object>.Fail("Loại đơn không hợp lệ hoặc đã ngừng tiếp nhận."));

        string? attachmentUrl = null;
        if (form.Attachment is not null)
        {
            if (form.Attachment.Length == 0 || form.Attachment.Length > MaximumAttachmentSize)
                return BadRequest(ApiResponse<object>.Fail("Tệp đính kèm phải có dung lượng từ 1 byte đến 10 MB."));
            var extension = ImageExtension(form.Attachment.ContentType);
            if (extension is null)
                return BadRequest(ApiResponse<object>.Fail("Tệp bằng chứng phải là ảnh JPG, PNG hoặc WebP."));
            await using var stream = form.Attachment.OpenReadStream();
            if (!await HasValidImageSignatureAsync(stream, form.Attachment.ContentType, ct))
                return BadRequest(ApiResponse<object>.Fail("Nội dung ảnh không đúng với định dạng tệp đã chọn."));
            stream.Position = 0;
            attachmentUrl = await storage.UploadFileAsync(
                stream,
                $"{Guid.NewGuid():N}{extension}",
                "support-evidence",
                ct);
        }

        var complaint = new SupportComplaint
        {
            ReaderId = readerId,
            RequestTypeId = requestType.Id,
            Content = content,
            AttachmentUrl = attachmentUrl
        };
        db.SupportComplaints.Add(complaint);
        await db.SaveChangesAsync(ct);

        var saved = await db.SupportComplaints.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.RequestType)
            .Include(x => x.Replies).ThenInclude(x => x.Sender).ThenInclude(x => x.Role)
            .FirstAsync(x => x.Id == complaint.Id, ct);
        var dto = MapComplaint(saved);
        await chatHub.Clients.Group(SupportChatHub.LibrarianGroup)
            .SendAsync("NewComplaint", dto, ct);
        return Ok(ApiResponse<SupportComplaintDto>.Ok(dto));
    }

    [HttpGet("history")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> GetHistory(CancellationToken ct)
    {
        if (!TryGetUserId(out var readerId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));
        var loans = await db.BorrowRecords.AsNoTracking()
            .Include(x => x.BookCopy).ThenInclude(x => x.Book)
            .Where(x => x.ReaderId == readerId)
            .OrderByDescending(x => x.BorrowDate ?? x.CreatedAt)
            .Take(200)
            .Select(x => new
            {
                id = x.Id,
                bookTitle = x.BookCopy.Book.Title,
                barcode = x.BookCopy.Barcode,
                status = x.Status.ToString(),
                borrowDate = x.BorrowDate,
                dueDate = x.DueDate,
                returnDate = x.ReturnDate,
                renewalCount = x.RenewalCount
            })
            .ToListAsync(ct);
        var fines = await db.Fines.AsNoTracking()
            .Include(x => x.BorrowRecord).ThenInclude(x => x.BookCopy).ThenInclude(x => x.Book)
            .Where(x => x.ReaderId == readerId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(200)
            .Select(x => new
            {
                id = x.Id,
                bookTitle = x.BorrowRecord.BookCopy.Book.Title,
                barcode = x.BorrowRecord.BookCopy.Barcode,
                amount = x.Amount,
                reason = x.Reason,
                status = x.Status.ToString(),
                createdAt = x.CreatedAt,
                paidAt = x.PaidAt
            })
            .ToListAsync(ct);
        return Ok(ApiResponse<object>.Ok(new { loans, fines }));
    }

    [HttpPut("request-types")]
    [Authorize(Roles = "Librarian,Admin")]
    public async Task<IActionResult> UpdateRequestTypes([FromBody] UpdateSupportRequestTypesRequest request, CancellationToken ct)
    {
        if (request.Names is null)
            return BadRequest(ApiResponse<object>.Fail("Danh sách loại đơn không hợp lệ."));
        var names = request.Names
            .Select(x => x?.Trim() ?? string.Empty)
            .Where(x => x.Length > 0)
            .ToList();
        if (names.Count is < 1 or > 30 ||
            names.Any(x => x.Length > 100) ||
            names.Distinct(StringComparer.OrdinalIgnoreCase).Count() != names.Count)
            return BadRequest(ApiResponse<object>.Fail("Cần có từ 1 đến 30 loại đơn khác nhau, mỗi loại tối đa 100 ký tự."));

        var existing = await db.SupportRequestTypes.ToListAsync(ct);
        foreach (var type in existing)
            type.IsActive = names.Contains(type.Name, StringComparer.OrdinalIgnoreCase);
        foreach (var name in names)
        {
            if (existing.Any(x => x.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
                continue;
            db.SupportRequestTypes.Add(new SupportRequestType { Name = name });
        }
        await db.SaveChangesAsync(ct);
        var saved = await db.SupportRequestTypes.AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.Name)
            .Select(x => new SupportRequestTypeDto(x.Id, x.Name))
            .ToListAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<SupportRequestTypeDto>>.Ok(saved));
    }

    [HttpGet("complaints")]
    [Authorize(Roles = "Librarian,Admin")]
    public async Task<IActionResult> GetComplaints(CancellationToken ct)
    {
        var rows = await db.SupportComplaints.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.RequestType)
            .Include(x => x.AcceptedBy)
            .Include(x => x.Replies).ThenInclude(x => x.Sender).ThenInclude(x => x.Role)
            .OrderByDescending(x => x.CreatedAt)
            .Take(200)
            .ToListAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<SupportComplaintDto>>.Ok(rows.Select(MapComplaint).ToList()));
    }

    [HttpPost("complaints/{id:guid}/accept")]
    [Authorize(Roles = "Librarian,Admin")]
    public async Task<IActionResult> AcceptComplaint(Guid id, CancellationToken ct)
    {
        if (!TryGetUserId(out var librarianId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var acceptedAt = DateTime.UtcNow;
        var updatedCount = await db.SupportComplaints
            .Where(x => x.Id == id && x.AcceptedById == null && x.Status != "Resolved")
            .ExecuteUpdateAsync(update => update
                .SetProperty(x => x.AcceptedById, librarianId)
                .SetProperty(x => x.AcceptedAt, acceptedAt)
                .SetProperty(x => x.UpdatedAt, acceptedAt)
                .SetProperty(x => x.Status, "InProgress"), ct);
        if (updatedCount == 0)
        {
            var exists = await db.SupportComplaints.AnyAsync(x => x.Id == id, ct);
            if (!exists)
                return NotFound(ApiResponse<object>.Fail("Không tìm thấy đơn hỗ trợ."));
            return Conflict(ApiResponse<object>.Fail("Đơn đã được thủ thư khác tiếp nhận hoặc đã hoàn tất."));
        }

        var complaint = await GetComplaintForDtoAsync(id, ct);
        var dto = MapComplaint(complaint);
        await BroadcastComplaintUpdateAsync(dto, complaint.ReaderId, ct);
        return Ok(ApiResponse<SupportComplaintDto>.Ok(dto));
    }

    [HttpPut("complaints/{id:guid}/schedule")]
    [Authorize(Roles = "Librarian,Admin")]
    public async Task<IActionResult> ScheduleComplaint(Guid id, [FromBody] ScheduleSupportComplaintRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var librarianId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));
        if (request.DueAt is { } dueAt && dueAt <= DateTimeOffset.UtcNow)
            return BadRequest(ApiResponse<object>.Fail("Hạn xử lý phải nằm trong tương lai."));

        var complaint = await db.SupportComplaints.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (complaint is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy đơn hỗ trợ."));
        var isAdmin = User.IsInRole("Admin");
        if (complaint.AcceptedById is null)
            return Conflict(ApiResponse<object>.Fail("Hãy tiếp nhận đơn trước khi đặt hạn xử lý."));
        if (!isAdmin && complaint.AcceptedById != librarianId)
            return Forbid();

        complaint.DueAt = request.DueAt;
        await db.SaveChangesAsync(ct);

        var updated = await GetComplaintForDtoAsync(id, ct);
        var dto = MapComplaint(updated);
        await BroadcastComplaintUpdateAsync(dto, updated.ReaderId, ct);
        return Ok(ApiResponse<SupportComplaintDto>.Ok(dto));
    }

    [HttpPost("complaints/{id:guid}/replies")]
    [Authorize(Roles = "Librarian,Admin")]
    public async Task<IActionResult> ReplyToComplaint(Guid id, [FromBody] ReplyToSupportComplaintRequest request, CancellationToken ct)
    {
        if (!TryGetUserId(out var senderId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));
        var message = request.Message?.Trim() ?? string.Empty;
        if (message.Length is < 1 or > 3000)
            return BadRequest(ApiResponse<object>.Fail("Phản hồi phải có từ 1 đến 3000 ký tự."));

        var complaint = await db.SupportComplaints
            .Include(x => x.Reader)
            .Include(x => x.RequestType)
            .Include(x => x.Replies).ThenInclude(x => x.Sender).ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (complaint is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy đơn hỗ trợ."));
        if (complaint.AcceptedById is not null &&
            complaint.AcceptedById != senderId &&
            !User.IsInRole("Admin"))
            return Conflict(ApiResponse<object>.Fail("Đơn này đã được tiếp nhận bởi thủ thư khác."));

        var respondedAt = DateTime.UtcNow;
        var reply = new SupportComplaintReply
        {
            ComplaintId = complaint.Id,
            SenderId = senderId,
            Message = message,
            CreatedAt = respondedAt
        };
        complaint.Replies.Add(reply);
        complaint.AcceptedById ??= senderId;
        complaint.AcceptedAt ??= respondedAt;
        complaint.FirstRespondedAt ??= respondedAt;
        if (complaint.Status == "Pending")
            complaint.Status = "InProgress";
        await db.SaveChangesAsync(ct);

        var saved = await db.SupportComplaintReplies.AsNoTracking()
            .Include(x => x.Sender).ThenInclude(x => x.Role)
            .FirstAsync(x => x.Id == reply.Id, ct);
        var dto = MapReply(saved);
        var updated = await db.SupportComplaints.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.RequestType)
            .Include(x => x.AcceptedBy)
            .Include(x => x.Replies).ThenInclude(x => x.Sender).ThenInclude(x => x.Role)
            .FirstAsync(x => x.Id == complaint.Id, ct);
        var updatedComplaint = MapComplaint(updated);
        await chatHub.Clients.Group(SupportChatHub.ReaderGroup(complaint.ReaderId))
            .SendAsync("ComplaintReplied", updatedComplaint, ct);
        await chatHub.Clients.Group(SupportChatHub.LibrarianGroup)
            .SendAsync("ComplaintUpdated", updatedComplaint, ct);
        return Ok(ApiResponse<SupportComplaintReplyDto>.Ok(dto));
    }

    private async Task<SupportComplaint> GetComplaintForDtoAsync(Guid id, CancellationToken ct)
        => await db.SupportComplaints.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.RequestType)
            .Include(x => x.AcceptedBy)
            .Include(x => x.Replies).ThenInclude(x => x.Sender).ThenInclude(x => x.Role)
            .FirstAsync(x => x.Id == id, ct);

    private async Task BroadcastComplaintUpdateAsync(SupportComplaintDto dto, Guid readerId, CancellationToken ct)
    {
        await chatHub.Clients.Group(SupportChatHub.ReaderGroup(readerId))
            .SendAsync("ComplaintUpdated", dto, ct);
        await chatHub.Clients.Group(SupportChatHub.LibrarianGroup)
            .SendAsync("ComplaintUpdated", dto, ct);
    }

    [HttpGet("chat/conversations")]
    [Authorize(Roles = "Librarian,Admin")]
    public async Task<IActionResult> GetConversations(CancellationToken ct)
    {
        var latest = await db.SupportChatMessages.AsNoTracking()
            .GroupBy(x => x.ReaderId)
            .Select(group => new { ReaderId = group.Key, LastMessageAt = group.Max(x => x.CreatedAt) })
            .OrderByDescending(x => x.LastMessageAt)
            .Take(100)
            .ToListAsync(ct);
        var ids = latest.Select(x => x.ReaderId).ToList();
        var readers = await db.UserProfiles.AsNoTracking()
            .Where(x => ids.Contains(x.Id))
            .Select(x => new { x.Id, x.FullName, x.AvatarUrl, x.StudentId })
            .ToListAsync(ct);
        var latestMessageIds = await db.SupportChatMessages.AsNoTracking()
            .Where(x => ids.Contains(x.ReaderId))
            .GroupBy(x => x.ReaderId)
            .Select(group => group
                .OrderByDescending(x => x.CreatedAt)
                .ThenByDescending(x => x.Id)
                .Select(x => x.Id)
                .First())
            .ToListAsync(ct);
        var lastMessages = await db.SupportChatMessages.AsNoTracking()
            .Where(x => latestMessageIds.Contains(x.Id))
            .Select(x => new SupportChatMessageDto(
                x.Id,
                x.ReaderId,
                x.SenderId,
                x.Sender.FullName,
                x.Sender.Role.Name,
                x.Message,
                x.CreatedAt))
            .ToListAsync(ct);
        var rows = latest.Select(x =>
        {
            var reader = readers.FirstOrDefault(r => r.Id == x.ReaderId);
            var lastMessage = lastMessages.FirstOrDefault(m => m.ReaderId == x.ReaderId);
            return reader is null || lastMessage is null
                ? null
                : new SupportConversationDto(reader.Id, reader.FullName, reader.AvatarUrl, reader.StudentId, lastMessage);
        }).OfType<SupportConversationDto>().ToList();
        return Ok(ApiResponse<IReadOnlyList<SupportConversationDto>>.Ok(rows));
    }

    [HttpGet("chat/conversations/{readerId:guid}/messages")]
    [Authorize(Roles = "Librarian,Admin")]
    public async Task<IActionResult> GetConversationMessages(Guid readerId, CancellationToken ct)
    {
        if (!await db.UserProfiles.AnyAsync(x => x.Id == readerId && x.Role.Name == "Reader", ct))
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy độc giả."));
        var rows = await GetChatMessagesAsync(readerId, ct);
        return Ok(ApiResponse<IReadOnlyList<SupportChatMessageDto>>.Ok(rows));
    }

    private async Task<IReadOnlyList<SupportChatMessageDto>> GetChatMessagesAsync(Guid readerId, CancellationToken ct)
    {
        var rows = await db.SupportChatMessages.AsNoTracking()
            .Where(x => x.ReaderId == readerId)
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.Id)
            .Take(100)
            .Select(x => new SupportChatMessageDto(
                x.Id,
                x.ReaderId,
                x.SenderId,
                x.Sender.FullName,
                x.Sender.Role.Name,
                x.Message,
                x.CreatedAt))
            .ToListAsync(ct);
        rows.Reverse();
        return rows;
    }

    private static SupportComplaintDto MapComplaint(SupportComplaint complaint)
        => new(
            complaint.Id,
            complaint.ReaderId,
            complaint.Reader.FullName,
            complaint.Reader.Email,
            complaint.Reader.AvatarUrl,
            complaint.RequestTypeId,
            complaint.RequestType.Name,
            complaint.Content,
            complaint.AttachmentUrl,
            complaint.Status,
            complaint.CreatedAt,
            complaint.AcceptedById,
            complaint.AcceptedBy?.FullName,
            complaint.AcceptedAt,
            complaint.DueAt,
            complaint.FirstRespondedAt,
            complaint.Replies.OrderBy(x => x.CreatedAt).Select(MapReply).ToList());

    private static SupportComplaintReplyDto MapReply(SupportComplaintReply reply)
        => new(reply.Id, reply.SenderId, reply.Sender.FullName, reply.Sender.Role.Name, reply.Message, reply.CreatedAt);

    private static string? ImageExtension(string? contentType)
        => contentType?.ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => null
        };

    private static async Task<bool> HasValidImageSignatureAsync(Stream stream, string? contentType, CancellationToken ct)
    {
        var header = new byte[12];
        var read = await stream.ReadAsync(header.AsMemory(), ct);
        if (contentType?.Equals("image/jpeg", StringComparison.OrdinalIgnoreCase) == true)
            return read >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF;
        if (contentType?.Equals("image/png", StringComparison.OrdinalIgnoreCase) == true)
            return read >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        return contentType?.Equals("image/webp", StringComparison.OrdinalIgnoreCase) == true
            && read >= 12
            && header.AsSpan(0, 4).SequenceEqual("RIFF"u8)
            && header.AsSpan(8, 4).SequenceEqual("WEBP"u8);
    }

    private bool TryGetUserId(out Guid userId)
        => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);
}

public sealed class CreateSupportComplaintForm
{
    public Guid RequestTypeId { get; set; }
    public string? Content { get; set; }
    public IFormFile? Attachment { get; set; }
}

public sealed record SupportRequestTypeDto(Guid Id, string Name);
public sealed record UpdateSupportRequestTypesRequest(IReadOnlyList<string?> Names);
public sealed record ReplyToSupportComplaintRequest(string? Message);
public sealed record ScheduleSupportComplaintRequest(DateTimeOffset? DueAt);
public sealed record SupportComplaintReplyDto(Guid Id, Guid SenderId, string SenderName, string SenderRole, string Message, DateTime CreatedAt);
public sealed record SupportComplaintDto(
    Guid Id,
    Guid ReaderId,
    string ReaderName,
    string ReaderEmail,
    string? ReaderAvatarUrl,
    Guid RequestTypeId,
    string RequestType,
    string Content,
    string? AttachmentUrl,
    string Status,
    DateTime CreatedAt,
    Guid? AcceptedById,
    string? AcceptedByName,
    DateTime? AcceptedAt,
    DateTimeOffset? DueAt,
    DateTime? FirstRespondedAt,
    IReadOnlyList<SupportComplaintReplyDto> Replies);
public sealed record SupportConversationDto(
    Guid ReaderId,
    string ReaderName,
    string? AvatarUrl,
    string? StudentId,
    SupportChatMessageDto LastMessage);
