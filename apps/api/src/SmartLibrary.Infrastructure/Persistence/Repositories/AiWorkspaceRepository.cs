using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public class AiWorkspaceRepository : IAiWorkspaceRepository
{
    private readonly AppDbContext _db;

    public AiWorkspaceRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<AiLibrarianSignals> GetSignalsAsync(int days, CancellationToken ct = default)
    {
        var window = Math.Clamp(days, 1, 365);
        var since = DateTime.UtcNow.AddDays(-window);
        var now = DateTime.UtcNow;
        var dueSoonLimit = now.AddDays(3);

        var majorNames = await _db.Majors.AsNoTracking()
            .OrderBy(item => item.Name)
            .Select(item => item.Name)
            .ToListAsync(ct);
        var categoryNames = await _db.Categories.AsNoTracking()
            .OrderBy(item => item.Name)
            .Select(item => item.Name)
            .ToListAsync(ct);

        var borrowCount = await _db.BorrowRecords.CountAsync(ct);
        var recentBorrowed = await _db.BorrowRecords.CountAsync(
            item => (item.BorrowDate ?? item.CreatedAt) >= since, ct);
        var recentReturned = await _db.BorrowRecords.CountAsync(
            item => item.ReturnDate != null && item.ReturnDate >= since, ct);
        var overdue = await _db.BorrowRecords.CountAsync(item => item.Status == BorrowStatus.Overdue, ct);
        var dueSoon = await _db.BorrowRecords.CountAsync(item =>
            item.Status == BorrowStatus.Borrowed
            && item.DueDate != null
            && item.DueDate >= now
            && item.DueDate <= dueSoonLimit, ct);

        var reviewCount = await _db.Reviews.CountAsync(ct);
        var averageRating = reviewCount == 0
            ? null
            : await _db.Reviews.AverageAsync(item => (double?)item.Rating, ct);
        var preferenceCount = await _db.ReadingPreferences.CountAsync(ct);

        var topBorrowed = await (
            from loan in _db.BorrowRecords.AsNoTracking()
            join copy in _db.BookCopies.AsNoTracking() on loan.BookCopyId equals copy.Id
            join book in _db.Books.AsNoTracking() on copy.BookId equals book.Id
            where (loan.BorrowDate ?? loan.CreatedAt) >= since
            group loan by new { book.Id, book.Title } into grouped
            orderby grouped.Count() descending
            select new AiBookSuggestionDto
            {
                Id = grouped.Key.Id,
                Title = grouped.Key.Title,
                BorrowCount = grouped.Count()
            })
            .Take(8)
            .ToListAsync(ct);

        var overdueRisks = await (
            from loan in _db.BorrowRecords.AsNoTracking()
            join copy in _db.BookCopies.AsNoTracking() on loan.BookCopyId equals copy.Id
            join book in _db.Books.AsNoTracking() on copy.BookId equals book.Id
            join reader in _db.UserProfiles.AsNoTracking() on loan.ReaderId equals reader.Id
            where loan.Status == BorrowStatus.Overdue
            orderby loan.DueDate
            select new
            {
                loan.Id,
                reader.FullName,
                book.Title,
                loan.DueDate
            })
            .Take(20)
            .ToListAsync(ct);

        return new AiLibrarianSignals
        {
            MajorCount = majorNames.Count,
            MajorSamples = majorNames.Take(3).ToList(),
            CategoryCount = categoryNames.Count,
            CategorySamples = categoryNames.Take(3).ToList(),
            BorrowCount = borrowCount,
            ReviewCount = reviewCount,
            AverageRating = averageRating,
            PreferenceCount = preferenceCount,
            Trends = new AiReadingTrendsDto
            {
                Days = window,
                Borrowed = recentBorrowed,
                Returned = recentReturned,
                Overdue = overdue,
                DueSoon = dueSoon
            },
            TopBorrowed = topBorrowed,
            OverdueRisks = overdueRisks.Select(item =>
            {
                var overdueDays = item.DueDate is null
                    ? 0
                    : Math.Max(0, (int)(now.Date - item.DueDate.Value.Date).TotalDays);
                return new AiOverdueRiskItemDto
                {
                    LoanId = item.Id,
                    ReaderName = item.FullName,
                    BookTitle = item.Title,
                    OverdueDays = overdueDays,
                    Risk = overdueDays >= 7 ? "cao" : "trung bình"
                };
            }).ToList()
        };
    }
}
