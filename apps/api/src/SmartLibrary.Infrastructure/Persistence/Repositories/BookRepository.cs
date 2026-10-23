using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Common;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

/// <summary>
/// Book repository implementation with paging and search.
/// </summary>
public class BookRepository : RepositoryBase<Book>, IBookRepository
{
    public BookRepository(AppDbContext context) : base(context) { }

    public async Task<PagedResult<Book>> GetPagedAsync(int page, int pageSize, string? search = null, Guid? categoryId = null, CancellationToken ct = default)
    {
        var query = _dbSet
            .AsNoTracking()
            .Include(b => b.Authors)
            .Include(b => b.Categories)
            .Where(b => !b.IsDeleted)
            .AsQueryable();

        if (categoryId.HasValue)
        {
            query = query.Where(b => b.Categories.Any(c => c.Id == categoryId.Value && !c.IsDeleted));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchLower = search.Trim().ToLower();
            query = query.Where(b =>
                b.Title.ToLower().Contains(searchLower) ||
                b.Code.ToLower().Contains(searchLower) ||
                (b.Isbn != null && b.Isbn.ToLower().Contains(searchLower)));
        }

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(b => b.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<Book>(items, totalCount, page, pageSize);
    }

    public async Task<Book?> GetByIsbnAsync(string isbn, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(b => b.Isbn == isbn, ct);

    public Task<bool> IsCodeTakenAsync(string code, CancellationToken ct = default)
    {
        var normalizedCode = code.Trim().ToLower();
        return _dbSet.AnyAsync(book => book.Code.ToLower() == normalizedCode, ct);
    }

    public async Task<Book?> GetWithDetailsAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(b => b.Authors)
            .Include(b => b.Categories)
            .Include(b => b.Publisher)
            .Include(b => b.Copies)
            .FirstOrDefaultAsync(b => b.Id == id, ct);

    public async Task<int> GetNextCopyNumberAsync(Guid bookId, string bookCode, CancellationToken ct = default)
    {
        var prefix = $"{bookCode}-";
        var existingBarcodes = await _context.BookCopies
            .IgnoreQueryFilters()
            .Where(copy => copy.BookId == bookId)
            .Select(copy => copy.Barcode)
            .ToListAsync(ct);

        var lastNumber = existingBarcodes
            .Where(barcode => barcode.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            .Select(barcode => int.TryParse(barcode[prefix.Length..], out var number) ? number : 0)
            .DefaultIfEmpty(0)
            .Max();

        return lastNumber + 1;
    }

    public async Task<(int TotalCopies, int AvailableCopies)> GetCopyAvailabilityAsync(
        Guid bookId, CancellationToken ct = default)
    {
        var copies = _context.BookCopies
            .AsNoTracking()
            .Where(copy => copy.BookId == bookId);
        var total = await copies.CountAsync(ct);
        var available = await copies.CountAsync(copy =>
            copy.IsAvailable
            && copy.Condition != BookCondition.Damaged
            && copy.Condition != BookCondition.Lost
            && !_context.BorrowRecords.Any(loan =>
                loan.BookCopyId == copy.Id
                && (loan.Status == BorrowStatus.Approved
                    || loan.Status == BorrowStatus.Borrowed
                    || loan.Status == BorrowStatus.Overdue)), ct);
        return (total, available);
    }
}
