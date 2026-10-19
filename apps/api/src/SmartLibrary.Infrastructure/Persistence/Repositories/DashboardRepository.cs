using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Statistics;
using SmartLibrary.Application.Features.Statistics.DTOs;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public class DashboardRepository : IDashboardRepository
{
    private readonly AppDbContext _context;

    public DashboardRepository(AppDbContext context)
    {
        _context = context;
    }

    private sealed class LibrarianStatsRow
    {
        public int PendingRegistrations { get; set; }
        public int TotalReaders { get; set; }
        public int TotalBooks { get; set; }
        public int AvailableCopies { get; set; }
        public int BorrowedCount { get; set; }
        public int OverdueCount { get; set; }
    }

    public async Task<LibrarianDashboardStatsDto> GetLibrarianStatsAsync(CancellationToken ct = default)
    {
        var statsRow = await _context.Database.SqlQueryRaw<LibrarianStatsRow>(@"
            SELECT 
                (SELECT COUNT(*)::int FROM registration_requests WHERE status::text IN ('Submitted', '0')) AS ""PendingRegistrations"",
                (SELECT COUNT(*)::int FROM profiles WHERE is_deleted = false) AS ""TotalReaders"",
                (SELECT COUNT(*)::int FROM books WHERE is_deleted = false) AS ""TotalBooks"",
                COALESCE((SELECT SUM(available_copies)::int FROM books WHERE is_deleted = false), 0) AS ""AvailableCopies"",
                (SELECT COUNT(*)::int FROM borrow_records WHERE status::text IN ('borrowed', 'Borrowed', '2') AND is_deleted = false) AS ""BorrowedCount"",
                (SELECT COUNT(*)::int FROM borrow_records WHERE status::text IN ('overdue', 'Overdue', '4') AND is_deleted = false) AS ""OverdueCount""
        ").FirstOrDefaultAsync(ct);

        return new LibrarianDashboardStatsDto
        {
            PendingRegistrations = statsRow?.PendingRegistrations ?? 0,
            TotalReaders = statsRow?.TotalReaders ?? 0,
            TotalBooks = statsRow?.TotalBooks ?? 0,
            AvailableCopies = statsRow?.AvailableCopies ?? 0,
            BorrowedCount = statsRow?.BorrowedCount ?? 0,
            OverdueCount = statsRow?.OverdueCount ?? 0
        };
    }

    public async Task<AdminOverviewDto> GetAdminOverviewAsync(CancellationToken ct = default)
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
            .Select(month => new MonthlyBorrowingDto
            {
                Year = month.Year,
                Month = month.Month,
                Count = monthlyBorrowingRows
                    .Where(row => row.Year == month.Year && row.Month == month.Month)
                    .Select(row => row.Count)
                    .FirstOrDefault()
            })
            .ToList();

        var borrowStatusBreakdown = await _context.BorrowRecords
            .GroupBy(b => b.Status)
            .Select(g => new BorrowStatusCountDto
            {
                Status = g.Key.ToString(),
                Count = g.Count()
            })
            .ToListAsync(ct);

        return new AdminOverviewDto
        {
            ActiveReaders = activeReaders,
            TotalBooks = totalBooks,
            TotalCopies = totalCopies,
            ActiveLoans = activeLoans,
            OverdueLoans = overdueLoans,
            PendingRegistrations = pendingRegistrations,
            PendingBorrowRequests = pendingBorrowRequests,
            MonthlyBorrowing = monthlyBorrowing,
            BorrowStatusBreakdown = borrowStatusBreakdown
        };
    }
}
