using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Infrastructure.Services;

public sealed class BookCatalogCache : IBookCatalogCache
{
    private const string CacheKey = "smartlibrary:book-catalog";
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;

    public BookCatalogCache(AppDbContext db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task<IReadOnlyList<BookCatalogItem>> GetAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(CacheKey, out IReadOnlyList<BookCatalogItem>? cached) && cached is not null)
            return cached;

        var rows = await _db.Books.AsNoTracking()
            .Where(book => !book.IsDeleted)
            .Select(book => new
            {
                book.Id,
                book.Title,
                book.Description,
                book.Code,
                book.Isbn,
                book.Language,
                book.CoverImageUrl,
                book.PublishedYear,
                book.AvailableCopies,
                book.TotalCopies,
                Authors = book.Authors.Select(author => author.Name).ToList(),
                Categories = book.Categories.Select(category => category.Name).ToList(),
                CategoryIds = book.Categories.Select(category => category.Id).ToList()
            })
            .OrderBy(book => book.Title)
            .Take(400)
            .ToListAsync(ct);

        IReadOnlyList<BookCatalogItem> books = rows.Select(book => new BookCatalogItem
        {
            Id = book.Id,
            Title = book.Title,
            Description = book.Description,
            Code = book.Code,
            Isbn = book.Isbn,
            Language = book.Language,
            CoverImageUrl = book.CoverImageUrl,
            PublishedYear = book.PublishedYear,
            AvailableCopies = book.AvailableCopies,
            TotalCopies = book.TotalCopies,
            Authors = book.Authors,
            Categories = book.Categories,
            CategoryIds = book.CategoryIds
        }).ToList();

        _cache.Set(CacheKey, books, Ttl);
        return books;
    }

    public void Invalidate() => _cache.Remove(CacheKey);
}
