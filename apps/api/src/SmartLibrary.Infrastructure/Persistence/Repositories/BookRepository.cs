using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Common;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Text;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

/// <summary>
/// Book repository implementation with paging and search.
/// </summary>
public class BookRepository : RepositoryBase<Book>, IBookRepository
{
    private readonly IBookCatalogCache _catalog;

    public BookRepository(AppDbContext context, IBookCatalogCache catalog) : base(context)
    {
        _catalog = catalog;
    }

    public async Task<PagedResult<Book>> GetPagedAsync(int page, int pageSize, string? search = null, Guid? categoryId = null, bool sortByReviewCount = false, bool reviewCountAscending = false, CancellationToken ct = default)
    {
        if (!string.IsNullOrWhiteSpace(search))
        {
            var snapshots = await _catalog.GetAsync(ct);
            if (categoryId.HasValue)
                snapshots = snapshots.Where(book => book.CategoryIds.Contains(categoryId.Value)).ToList();

            var ranked = snapshots
                .Select(book => (
                    Book: book,
                    Score: BookKeywordRanker.Score(
                        search,
                        book.Title,
                        book.Description,
                        book.Code,
                        book.Isbn,
                        book.Authors,
                        book.Categories,
                        book.Language)))
                .Where(item => item.Score > 0)
                .OrderByDescending(item => item.Score)
                .ThenBy(item => item.Book.Title)
                .ToList();

            if (sortByReviewCount)
            {
                var matchingIds = ranked.Select(item => item.Book.Id).ToArray();
                var reviewCounts = await _context.Reviews.IgnoreQueryFilters().AsNoTracking()
                    .Where(review => !review.IsDeleted && matchingIds.Contains(review.BookId))
                    .GroupBy(review => review.BookId)
                    .Select(group => new { BookId = group.Key, Count = group.Count() })
                    .ToDictionaryAsync(item => item.BookId, item => item.Count, ct);

                ranked = (reviewCountAscending
                        ? ranked.OrderBy(item => reviewCounts.GetValueOrDefault(item.Book.Id))
                        : ranked.OrderByDescending(item => reviewCounts.GetValueOrDefault(item.Book.Id)))
                    .ThenByDescending(item => item.Score)
                    .ThenBy(item => item.Book.Title)
                    .ToList();
            }

            var pageBooks = ranked
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(item =>
                {
                    var book = ToBook(item.Book);
                    return book;
                })
                .ToList();
            if (pageBooks.Count > 0)
            {
                var pageIds = pageBooks.Select(book => book.Id).ToArray();
                var reviewCounts = await _context.Reviews.IgnoreQueryFilters().AsNoTracking()
                    .Where(review => !review.IsDeleted && pageIds.Contains(review.BookId))
                    .GroupBy(review => review.BookId)
                    .Select(group => new { BookId = group.Key, Count = group.Count() })
                    .ToDictionaryAsync(item => item.BookId, item => item.Count, ct);
                foreach (var book in pageBooks) book.ReviewCount = reviewCounts.GetValueOrDefault(book.Id);
            }
            return new PagedResult<Book>(pageBooks, ranked.Count, page, pageSize);
        }

        // Apply soft-delete predicates explicitly here. The catalog is a high-traffic
        // query with split collection includes; avoiding composed global filters keeps
        // EF from evaluating captured filter parameters while compiling this query.
        var query = _dbSet.IgnoreQueryFilters().AsNoTracking().Where(book => !book.IsDeleted);
        if (categoryId.HasValue)
        {
            var selectedCategoryId = categoryId.Value;
            query = query.Where(book => book.Categories.Any(category => category.Id == selectedCategoryId && !category.IsDeleted));
        }

        var totalCount = await query.CountAsync(ct);
        IQueryable<Book> orderedQuery;
        if (sortByReviewCount)
        {
            var reviewCounts = _context.Reviews.IgnoreQueryFilters().AsNoTracking()
                .Where(review => !review.IsDeleted)
                .GroupBy(review => review.BookId)
                .Select(group => new { BookId = group.Key, Count = group.Count() });

            orderedQuery = reviewCountAscending
                ? from book in query
                  join reviewCount in reviewCounts on book.Id equals reviewCount.BookId into counts
                  from reviewCount in counts.DefaultIfEmpty()
                  orderby reviewCount == null ? 0 : reviewCount.Count, book.Title
                  select book
                : from book in query
                  join reviewCount in reviewCounts on book.Id equals reviewCount.BookId into counts
                  from reviewCount in counts.DefaultIfEmpty()
                  orderby reviewCount == null ? 0 : reviewCount.Count descending, book.Title
                  select book;
        }
        else
        {
            orderedQuery = query.OrderByDescending(book => book.CreatedAt);
        }

        var items = await orderedQuery
            .AsSplitQuery()
            .Include(book => book.Authors.Where(author => !author.IsDeleted))
            .Include(book => book.Categories.Where(category => !category.IsDeleted))
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        if (items.Count > 0)
        {
            var pageIds = items.Select(book => book.Id).ToArray();
            var reviewCounts = await _context.Reviews.IgnoreQueryFilters().AsNoTracking()
                .Where(review => !review.IsDeleted && pageIds.Contains(review.BookId))
                .GroupBy(review => review.BookId)
                .Select(group => new { BookId = group.Key, Count = group.Count() })
                .ToDictionaryAsync(item => item.BookId, item => item.Count, ct);
            foreach (var book in items) book.ReviewCount = reviewCounts.GetValueOrDefault(book.Id);
        }

        return new PagedResult<Book>(items, totalCount, page, pageSize);
    }

    private static Book ToBook(BookCatalogItem item) => new()
    {
        Id = item.Id,
        Title = item.Title,
        Description = item.Description,
        Code = item.Code,
        Isbn = item.Isbn,
        Language = item.Language ?? "vi",
        CoverImageUrl = item.CoverImageUrl,
        PublishedYear = item.PublishedYear,
        AvailableCopies = item.AvailableCopies,
        TotalCopies = item.TotalCopies,
        Authors = item.Authors.Select(name => new Author { Name = name }).ToList(),
        Categories = item.Categories.Select(name => new Category { Name = name }).ToList()
    };

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
