using SmartLibrary.Application.Features.Categories.DTOs;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Categories;

public interface ICategoryRepository
{
    Task<IReadOnlyList<CategoryDto>> GetAllWithBookCountAsync(CancellationToken ct = default);
    Task<CategoryDto?> GetByIdWithBookCountAsync(Guid id, CancellationToken ct = default);
    Task<Category?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<bool> ExistsByNameAsync(string name, Guid? excludeId = null, CancellationToken ct = default);
    Task AddAsync(Category category, CancellationToken ct = default);
    Task UpdateAsync(Category category, CancellationToken ct = default);
    Task DeleteAsync(Category category, CancellationToken ct = default);
}
