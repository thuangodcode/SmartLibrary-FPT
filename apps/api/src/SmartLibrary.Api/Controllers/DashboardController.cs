using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SmartLibrary.Application.Common;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.Controllers;

public class DashboardStatsDto
{
    public int PendingRegistrations { get; set; }
    public int TotalReaders { get; set; }
    public int TotalBooks { get; set; }
    public int AvailableCopies { get; set; }
    public int BorrowedCount { get; set; }
    public int OverdueCount { get; set; }
}

[ApiController]
[Route("api/v1/[controller]")]
[Authorize(Policy = "LibrarianOnly")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IMemoryCache _cache;

    public DashboardController(AppDbContext context, IMemoryCache cache)
    {
        _context = context;
        _cache = cache;
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(CancellationToken ct = default)
    {
        const string cacheKey = "librarian_dashboard_stats";
        if (_cache.TryGetValue(cacheKey, out var cached) && cached != null)
        {
            return Ok(ApiResponse<object>.Ok(cached));
        }

        var statsRow = await _context.Database.SqlQueryRaw<DashboardStatsDto>(@"
            SELECT 
                (SELECT COUNT(*)::int FROM registration_requests WHERE status::text IN ('Submitted', '0')) AS ""PendingRegistrations"",
                (SELECT COUNT(*)::int FROM profiles WHERE is_deleted = false) AS ""TotalReaders"",
                (SELECT COUNT(*)::int FROM books WHERE is_deleted = false) AS ""TotalBooks"",
                COALESCE((SELECT SUM(available_copies)::int FROM books WHERE is_deleted = false), 0) AS ""AvailableCopies"",
                (SELECT COUNT(*)::int FROM borrow_records WHERE status::text IN ('borrowed', 'Borrowed', '2') AND is_deleted = false) AS ""BorrowedCount"",
                (SELECT COUNT(*)::int FROM borrow_records WHERE status::text IN ('overdue', 'Overdue', '4') AND is_deleted = false) AS ""OverdueCount""
        ").FirstOrDefaultAsync(ct);

        var data = new
        {
            pendingRegistrations = statsRow?.PendingRegistrations ?? 0,
            totalReaders = statsRow?.TotalReaders ?? 0,
            totalBooks = statsRow?.TotalBooks ?? 0,
            availableCopies = statsRow?.AvailableCopies ?? 0,
            borrowedCount = statsRow?.BorrowedCount ?? 0,
            overdueCount = statsRow?.OverdueCount ?? 0
        };

        _cache.Set(cacheKey, data, TimeSpan.FromSeconds(30));
        return Ok(ApiResponse<object>.Ok(data));
    }

    [Authorize(Policy = "AdminOnly")]
    [HttpGet("admin-overview")]
    public async Task<IActionResult> GetAdminOverview(CancellationToken ct = default)
    {
        var pendingRegistrations = await _context.RegistrationRequests
            .CountAsync(r => r.Status == RegistrationRequestStatus.Submitted, ct);
        var readerRoleId = await _context.Database
            .SqlQuery<Guid>($"SELECT id AS \"Value\" FROM roles WHERE LOWER(name) = 'reader' LIMIT 1")
            .SingleOrDefaultAsync(ct);
        var activeReaders = readerRoleId == Guid.Empty
            ? 0
            : await _context.UserProfiles
                .CountAsync(p => p.IsActive && p.Status == AccountStatus.Active && p.RoleId == readerRoleId, ct);
        var totalBooks = await _context.Books.CountAsync(ct);
        var totalCopies = await _context.Books.SumAsync(b => (long)b.TotalCopies, ct);
        var activeLoans = await _context.BorrowRecords.CountAsync(b => b.Status == BorrowStatus.Borrowed, ct);
        var overdueLoans = await _context.BorrowRecords.CountAsync(b => b.Status == BorrowStatus.Overdue, ct);
        var pendingBorrowRequests = await _context.BorrowRecords.CountAsync(b => b.Status == BorrowStatus.Pending, ct);

        var firstMonth = new DateTime(
            DateTime.UtcNow.Year,
            DateTime.UtcNow.Month,
            1,
            0,
            0,
            0,
            DateTimeKind.Utc).AddMonths(-5);
        var monthlyBorrowingRows = await _context.BorrowRecords
            .Where(b => b.BorrowDate.HasValue &&
                        b.BorrowDate.Value >= firstMonth &&
                        b.Status != BorrowStatus.Pending &&
                        b.Status != BorrowStatus.Rejected)
            .GroupBy(b => new { b.BorrowDate!.Value.Year, b.BorrowDate.Value.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Count() })
            .ToListAsync(ct);

        var monthlyBorrowing = Enumerable.Range(0, 6)
            .Select(offset => firstMonth.AddMonths(offset))
            .Select(month => new
            {
                year = month.Year,
                month = month.Month,
                count = monthlyBorrowingRows
                    .Where(row => row.Year == month.Year && row.Month == month.Month)
                    .Select(row => row.Count)
                    .FirstOrDefault()
            });

        var borrowStatusBreakdown = await _context.BorrowRecords
            .GroupBy(b => b.Status)
            .Select(g => new { status = g.Key, count = g.Count() })
            .ToListAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            activeReaders,
            totalBooks,
            totalCopies,
            activeLoans,
            overdueLoans,
            pendingRegistrations,
            pendingBorrowRequests,
            monthlyBorrowing,
            borrowStatusBreakdown
        }));
    }
}
