using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Books;

/// <summary>
/// Book-specific repository interface extending the generic repository.
/// </summary>
public interface IBookRepository : IRepository<Book>
{
    Task<PagedResult<Book>> GetPagedAsync(int page, int pageSize, string? search = null, Guid? categoryId = null, bool sortByReviewCount = false, bool reviewCountAscending = false, CancellationToken ct = default);
    Task<Book?> GetByIsbnAsync(string isbn, CancellationToken ct = default);
    Task<bool> IsCodeTakenAsync(string code, CancellationToken ct = default);
    Task<Book?> GetWithDetailsAsync(Guid id, CancellationToken ct = default);
    Task<Book?> GetDeletedWithDetailsAsync(Guid id, CancellationToken ct = default);
    Task<int> GetNextCopyNumberAsync(Guid bookId, string bookCode, CancellationToken ct = default);
    Task<(int TotalCopies, int AvailableCopies)> GetCopyAvailabilityAsync(Guid bookId, CancellationToken ct = default);
}
