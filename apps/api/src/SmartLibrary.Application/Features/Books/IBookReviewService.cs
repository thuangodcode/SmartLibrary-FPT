using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books.DTOs;

namespace SmartLibrary.Application.Features.Books;

public interface IBookReviewService
{
    Task<Result<IReadOnlyList<BookReviewDto>>> GetAsync(
        Guid bookId, Guid currentReaderId, CancellationToken ct = default);

    Task<Result<BookReviewDto>> CreateAsync(
        Guid bookId, Guid readerId, SaveBookReviewRequest request, CancellationToken ct = default);

    Task<Result<BookReviewDto>> UpdateAsync(
        Guid bookId, Guid reviewId, Guid readerId, SaveBookReviewRequest request, CancellationToken ct = default);

    Task<Result<Guid>> DeleteAsync(
        Guid bookId, Guid reviewId, Guid readerId, CancellationToken ct = default);
}
