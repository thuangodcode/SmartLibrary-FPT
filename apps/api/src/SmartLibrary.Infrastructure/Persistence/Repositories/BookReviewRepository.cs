using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public sealed class BookReviewRepository(AppDbContext db) : IBookReviewRepository
{
    public Task<bool> BookExistsAsync(Guid bookId, CancellationToken ct)
        => db.Books.AnyAsync(book => book.Id == bookId, ct);

    public async Task<IReadOnlyList<Review>> GetReviewsAsync(Guid bookId, CancellationToken ct)
        => await db.Reviews
            .AsNoTracking()
            .Include(review => review.Reader)
            .Where(review => review.BookId == bookId)
            .OrderByDescending(review => review.CreatedAt)
            .ToListAsync(ct);

    public Task<Review?> GetTrackedReviewAsync(Guid reviewId, CancellationToken ct)
        => db.Reviews.Include(review => review.Reader)
            .FirstOrDefaultAsync(review => review.Id == reviewId, ct);

    public Task<Review?> GetTrackedReaderReviewAsync(Guid bookId, Guid readerId, CancellationToken ct)
        => db.Reviews.IgnoreQueryFilters()
            .Include(review => review.Reader)
            .FirstOrDefaultAsync(review => review.BookId == bookId && review.ReaderId == readerId, ct);

    public Task<Book?> GetTrackedBookAsync(Guid bookId, CancellationToken ct)
        => db.Books.FirstOrDefaultAsync(book => book.Id == bookId, ct);

    public async Task AddReviewAsync(Review review, CancellationToken ct)
        => await db.Reviews.AddAsync(review, ct);

    public async Task<decimal> GetAverageRatingAsync(Guid bookId, CancellationToken ct)
        => await db.Reviews.Where(review => review.BookId == bookId)
            .AverageAsync(review => (decimal?)review.Rating, ct) ?? 0m;
}
