using SmartLibrary.Application.Features.Categories.DTOs;

namespace SmartLibrary.Application.Features.Categories;

public interface ICategoryRepository
{
    Task<IReadOnlyList<CategoryDto>> GetAllWithBookCountAsync(CancellationToken ct = default);
}
