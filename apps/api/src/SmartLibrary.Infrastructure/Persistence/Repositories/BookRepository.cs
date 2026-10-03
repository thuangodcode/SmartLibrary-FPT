using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

/// <summary>
/// Book repository implementation with paging and search.
/// </summary>
public class BookRepository : RepositoryBase<Book>, IBookRepository
{
    public BookRepository(AppDbContext context) : base(context) { }

    public async Task<PagedResult<Book>> GetPagedAsync(int page, int pageSize, string? search = null, CancellationToken ct = default)
    {
        var query = _dbSet
            .Include(b => b.Authors)
            .Include(b => b.Categories)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchLower = search.ToLower();
            query = query.Where(b =>
                b.Title.ToLower().Contains(searchLower) ||
                (b.Isbn != null && b.Isbn.Contains(searchLower)));
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

    public async Task<Book?> GetWithDetailsAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(b => b.Authors)
            .Include(b => b.Categories)
            .Include(b => b.Publisher)
            .Include(b => b.Copies)
            .FirstOrDefaultAsync(b => b.Id == id, ct);
}
