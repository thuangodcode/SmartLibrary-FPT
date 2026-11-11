using SmartLibrary.Application.Common;

namespace SmartLibrary.Application.Features.Books;

public interface IBookCodeGenerator
{
    // Creation callers must hold a database transaction until the new book is saved.
    Task<Result<string>> GetNextAsync(Guid categoryId, bool forCreation = false, CancellationToken ct = default);
}
