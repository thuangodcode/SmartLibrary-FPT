using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Common;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class ReadersController : ControllerBase
{
    private readonly AppDbContext _context;

    public ReadersController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetReaders(
        [FromQuery] string? q,
        [FromQuery] string? status,
        [FromQuery] string? readerType,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15,
        CancellationToken ct = default)
    {
        var query = _context.UserProfiles
            .Include(u => u.Role)
            .Where(u => !u.IsDeleted)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var lowerQ = q.Trim().ToLower();
            query = query.Where(u =>
                u.FullName.ToLower().Contains(lowerQ) ||
                u.Email.ToLower().Contains(lowerQ) ||
                (u.Phone != null && u.Phone.Contains(lowerQ)) ||
                (u.StudentId != null && u.StudentId.ToLower().Contains(lowerQ)));
        }

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (Enum.TryParse<AccountStatus>(status, true, out var parsedStatus))
            {
                query = query.Where(u => u.Status == parsedStatus);
            }
        }

        if (!string.IsNullOrWhiteSpace(readerType) && !readerType.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (Enum.TryParse<ReaderType>(readerType, true, out var parsedType))
            {
                query = query.Where(u => u.ReaderType == parsedType);
            }
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new
            {
                u.Id,
                u.FullName,
                u.Email,
                u.Phone,
                u.StudentId,
                u.Address,
                u.DateOfBirth,
                u.AvatarUrl,
                RoleName = u.Role != null ? u.Role.Name : "Reader",
                u.Status,
                u.ReaderType,
                u.MembershipExpiresAt,
                u.IsActive,
                u.LastLoginAt,
                u.CreatedAt,
                BorrowingCount = _context.BorrowRecords.Count(b => b.ReaderId == u.Id && b.Status == BorrowStatus.Borrowed && !b.IsDeleted),
                OverdueCount = _context.BorrowRecords.Count(b => b.ReaderId == u.Id && b.Status == BorrowStatus.Overdue && !b.IsDeleted),
                UnpaidFines = _context.Fines.Where(f => f.ReaderId == u.Id && f.Status == FineStatus.Pending && !f.IsDeleted).Sum(f => (decimal?)f.Amount) ?? 0
            })
            .ToListAsync(ct);

        // Stats summary
        var totalActive = await _context.UserProfiles.CountAsync(u => !u.IsDeleted && u.Status == AccountStatus.Active, ct);
        var totalPending = await _context.UserProfiles.CountAsync(u => !u.IsDeleted && (u.Status == AccountStatus.PendingApproval || u.Status == AccountStatus.PendingVerification), ct);
        var totalSuspended = await _context.UserProfiles.CountAsync(u => !u.IsDeleted && u.Status == AccountStatus.Suspended, ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            items,
            totalCount = total,
            page,
            pageSize,
            totalPages = (int)Math.Ceiling(total / (double)pageSize),
            stats = new
            {
                totalReaders = await _context.UserProfiles.CountAsync(u => !u.IsDeleted, ct),
                activeReaders = totalActive,
                pendingReaders = totalPending,
                suspendedReaders = totalSuspended
            }
        }));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetReaderDetail(Guid id, CancellationToken ct = default)
    {
        var reader = await _context.UserProfiles
            .Include(u => u.Role)
            .Where(u => u.Id == id && !u.IsDeleted)
            .Select(u => new
            {
                u.Id,
                u.FullName,
                u.Email,
                u.Phone,
                u.StudentId,
                u.Address,
                u.DateOfBirth,
                u.AvatarUrl,
                RoleName = u.Role != null ? u.Role.Name : "Reader",
                u.Status,
                u.ReaderType,
                u.MembershipExpiresAt,
                u.IsActive,
                u.LastLoginAt,
                u.CreatedAt,
                BorrowCount = _context.BorrowRecords.Count(b => b.ReaderId == u.Id && !b.IsDeleted),
                ActiveBorrowCount = _context.BorrowRecords.Count(b => b.ReaderId == u.Id && b.Status == BorrowStatus.Borrowed && !b.IsDeleted),
                OverdueCount = _context.BorrowRecords.Count(b => b.ReaderId == u.Id && b.Status == BorrowStatus.Overdue && !b.IsDeleted),
                TotalFines = _context.Fines.Where(f => f.ReaderId == u.Id && !f.IsDeleted).Sum(f => (decimal?)f.Amount) ?? 0,
                Registration = _context.RegistrationRequests
                    .Where(r => r.UserId == u.Id)
                    .OrderByDescending(r => r.SubmittedAt)
                    .Select(r => new
                    {
                        r.Id,
                        r.DocumentType,
                        r.Status,
                        r.SubmittedAt,
                        FrontDocUrl = r.Documents.Where(d => d.Side == DocumentSide.Front).Select(d => d.StoragePath).FirstOrDefault(),
                        BackDocUrl = r.Documents.Where(d => d.Side == DocumentSide.Back).Select(d => d.StoragePath).FirstOrDefault(),
                        SelfieUrl = r.Documents.Where(d => d.Side == DocumentSide.Selfie).Select(d => d.StoragePath).FirstOrDefault()
                    }).FirstOrDefault()
            })
            .FirstOrDefaultAsync(ct);

        if (reader == null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy độc giả."));

        return Ok(ApiResponse<object>.Ok(reader));
    }

    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateReaderStatus(Guid id, [FromBody] UpdateStatusRequest request, CancellationToken ct = default)
    {
        var user = await _context.UserProfiles.FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct);
        if (user == null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy độc giả."));

        if (!Enum.TryParse<AccountStatus>(request.Status, true, out var newStatus))
            return BadRequest(ApiResponse<object>.Fail("Trạng thái không hợp lệ."));

        user.Status = newStatus;
        user.IsActive = newStatus == AccountStatus.Active;
        await _context.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new { user.Id, Status = user.Status.ToString() }, new { message = "Cập nhật trạng thái thành công!" }));
    }

    [HttpPost("{id:guid}/extend-membership")]
    public async Task<IActionResult> ExtendMembership(Guid id, [FromBody] ExtendMembershipRequest request, CancellationToken ct = default)
    {
        var user = await _context.UserProfiles.FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct);
        if (user == null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy độc giả."));

        var months = request.Months > 0 ? request.Months : 12;
        var currentExpiry = user.MembershipExpiresAt.HasValue && user.MembershipExpiresAt.Value > DateTime.UtcNow
            ? user.MembershipExpiresAt.Value
            : DateTime.UtcNow;

        user.MembershipExpiresAt = currentExpiry.AddMonths(months);
        if (user.Status != AccountStatus.Active)
        {
            user.Status = AccountStatus.Active;
            user.IsActive = true;
        }

        await _context.SaveChangesAsync(ct);

        return Ok(ApiResponse<object>.Ok(new { user.Id, user.MembershipExpiresAt }, new { message = $"Đã gia hạn thẻ thêm {months} tháng thành công!" }));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateReader(Guid id, [FromBody] UpdateReaderRequest request, CancellationToken ct = default)
    {
        var user = await _context.UserProfiles.FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct);
        if (user == null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy độc giả."));

        if (!string.IsNullOrWhiteSpace(request.FullName)) user.FullName = request.FullName.Trim();
        if (!string.IsNullOrWhiteSpace(request.Phone)) user.Phone = request.Phone.Trim();
        if (!string.IsNullOrWhiteSpace(request.Address)) user.Address = request.Address.Trim();
        if (!string.IsNullOrWhiteSpace(request.StudentId)) user.StudentId = request.StudentId.Trim();
        if (!string.IsNullOrWhiteSpace(request.ReaderType) && Enum.TryParse<ReaderType>(request.ReaderType, true, out var rType))
        {
            user.ReaderType = rType;
        }

        await _context.SaveChangesAsync(ct);
        return Ok(ApiResponse<object>.Ok(user, new { message = "Cập nhật thông tin độc giả thành công!" }));
    }
}

public class UpdateStatusRequest
{
    public string Status { get; set; } = string.Empty;
    public string? Reason { get; set; }
}

public class ExtendMembershipRequest
{
    public int Months { get; set; } = 12;
}

public class UpdateReaderRequest
{
    public string? FullName { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? StudentId { get; set; }
    public string? ReaderType { get; set; }
}
