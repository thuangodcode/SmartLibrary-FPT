using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Books;

public sealed class BookReviewService(IBookReviewRepository reviews, IUnitOfWork unitOfWork) : IBookReviewService
{
    public async Task<Result<IReadOnlyList<BookReviewDto>>> GetAsync(
        Guid bookId, Guid currentReaderId, CancellationToken ct = default)
    {
        if (!await reviews.BookExistsAsync(bookId, ct))
            return Result<IReadOnlyList<BookReviewDto>>.Failure("Không tìm thấy đầu sách.");

        var items = await reviews.GetReviewsAsync(bookId, ct);
        return Result<IReadOnlyList<BookReviewDto>>.Success(items
            .Select(review => Map(review, currentReaderId))
            .ToArray());
    }

    public async Task<Result<BookReviewDto>> CreateAsync(
        Guid bookId, Guid readerId, SaveBookReviewRequest request, CancellationToken ct = default)
    {
        if (readerId == Guid.Empty)
            return Result<BookReviewDto>.Failure("Không xác định được tài khoản độc giả.");
        if (request.Rating is < 1 or > 5)
            return Result<BookReviewDto>.Failure("Số sao phải từ 1 đến 5.");
        if (!await reviews.BookExistsAsync(bookId, ct))
            return Result<BookReviewDto>.Failure("Không tìm thấy đầu sách.");

        var review = await reviews.GetTrackedReaderReviewAsync(bookId, readerId, ct);
        if (review is not null && !review.IsDeleted)
            return Result<BookReviewDto>.Failure("Bạn đã đánh giá đầu sách này. Hãy chỉnh sửa đánh giá hiện có.");

        if (review is null)
        {
            review = new Review { BookId = bookId, ReaderId = readerId };
            await reviews.AddReviewAsync(review, ct);
        }

        review.Rating = request.Rating;
        review.Comment = NormalizeComment(request.Comment);
        review.IsDeleted = false;
        review.UpdatedAt = DateTime.UtcNow;
        await unitOfWork.SaveChangesAsync(ct);
        await UpdateBookRatingAsync(bookId, ct);
        await unitOfWork.SaveChangesAsync(ct);

        var saved = await reviews.GetTrackedReviewAsync(review.Id, ct);
        return saved is null
            ? Result<BookReviewDto>.Failure("Không đọc được đánh giá vừa lưu.")
            : Result<BookReviewDto>.Success(Map(saved, readerId));
    }

    public async Task<Result<BookReviewDto>> UpdateAsync(
        Guid bookId, Guid reviewId, Guid readerId, SaveBookReviewRequest request, CancellationToken ct = default)
    {
        if (request.Rating is < 1 or > 5)
            return Result<BookReviewDto>.Failure("Số sao phải từ 1 đến 5.");

        var review = await reviews.GetTrackedReviewAsync(reviewId, ct);
        if (review is null || review.BookId != bookId || review.ReaderId != readerId || review.IsDeleted)
            return Result<BookReviewDto>.Failure("Không tìm thấy đánh giá của bạn.");

        review.Rating = request.Rating;
        review.Comment = NormalizeComment(request.Comment);
        review.UpdatedAt = DateTime.UtcNow;
        var updatedBookId = review.BookId;
        await unitOfWork.SaveChangesAsync(ct);
        await UpdateBookRatingAsync(updatedBookId, ct);
        await unitOfWork.SaveChangesAsync(ct);

        return Result<BookReviewDto>.Success(Map(review, readerId));
    }

    public async Task<Result<Guid>> DeleteAsync(
        Guid bookId, Guid reviewId, Guid readerId, CancellationToken ct = default)
    {
        var review = await reviews.GetTrackedReviewAsync(reviewId, ct);
        if (review is null || review.BookId != bookId || review.ReaderId != readerId || review.IsDeleted)
            return Result<Guid>.Failure("Không tìm thấy đánh giá của bạn.");

        review.IsDeleted = true;
        review.UpdatedAt = DateTime.UtcNow;
        var updatedBookId = review.BookId;
        await unitOfWork.SaveChangesAsync(ct);
        await UpdateBookRatingAsync(updatedBookId, ct);
        await unitOfWork.SaveChangesAsync(ct);
        return Result<Guid>.Success(review.Id);
    }

    private async Task UpdateBookRatingAsync(Guid bookId, CancellationToken ct)
    {
        var book = await reviews.GetTrackedBookAsync(bookId, ct);
        if (book is not null)
            book.AverageRating = await reviews.GetAverageRatingAsync(bookId, ct);
    }

    private static BookReviewDto Map(Review review, Guid currentReaderId)
        => new(
            review.Id,
            review.Reader?.FullName ?? "Độc giả",
            review.Rating,
            review.Comment,
            review.CreatedAt,
            review.UpdatedAt,
            review.ReaderId == currentReaderId && currentReaderId != Guid.Empty);

    private static string? NormalizeComment(string? comment)
        => string.IsNullOrWhiteSpace(comment) ? null : comment.Trim();
}
