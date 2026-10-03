using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Books;

/// <summary>
/// Book-specific repository interface extending the generic repository.
/// </summary>
public interface IBookRepository : IRepository<Book>
{
    Task<PagedResult<Book>> GetPagedAsync(int page, int pageSize, string? search = null, CancellationToken ct = default);
    Task<Book?> GetByIsbnAsync(string isbn, CancellationToken ct = default);
    Task<Book?> GetWithDetailsAsync(Guid id, CancellationToken ct = default);
}
