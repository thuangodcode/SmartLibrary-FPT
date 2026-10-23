using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Books;

public interface IBookReviewRepository
{
    Task<bool> BookExistsAsync(Guid bookId, CancellationToken ct);
    Task<IReadOnlyList<Review>> GetReviewsAsync(Guid bookId, CancellationToken ct);
    Task<Review?> GetTrackedReviewAsync(Guid reviewId, CancellationToken ct);
    Task<Review?> GetTrackedReaderReviewAsync(Guid bookId, Guid readerId, CancellationToken ct);
    Task<Book?> GetTrackedBookAsync(Guid bookId, CancellationToken ct);
    Task AddReviewAsync(Review review, CancellationToken ct);
    Task<decimal> GetAverageRatingAsync(Guid bookId, CancellationToken ct);
}
