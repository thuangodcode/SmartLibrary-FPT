using SmartLibrary.Application.Features.Categories.DTOs;

namespace SmartLibrary.Application.Features.Categories;

public class CategoryService
{
    private readonly ICategoryRepository _categoryRepository;

    public CategoryService(ICategoryRepository categoryRepository)
    {
        _categoryRepository = categoryRepository;
    }

    public Task<IReadOnlyList<CategoryDto>> GetAllAsync(CancellationToken ct = default) =>
        _categoryRepository.GetAllWithBookCountAsync(ct);
}
