using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Categories;
using SmartLibrary.Application.Features.Categories.DTOs;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public class CategoryRepository : ICategoryRepository
{
    private readonly AppDbContext _context;

    public CategoryRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<CategoryDto>> GetAllWithBookCountAsync(CancellationToken ct = default)
    {
        return await _context.Categories
            .AsNoTracking()
            .Where(c => !c.IsDeleted)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new CategoryDto
            {
                Id = c.Id,
                Name = c.Name,
                Description = c.Description,
                ImageUrl = c.ImageUrl,
                BookCount = c.Books.Count(b => !b.IsDeleted),
                CreatedAt = c.CreatedAt
            })
            .ToListAsync(ct);
    }

    public async Task<CategoryDto?> GetByIdWithBookCountAsync(Guid id, CancellationToken ct = default)
    {
        return await _context.Categories
            .AsNoTracking()
            .Where(c => c.Id == id && !c.IsDeleted)
            .Select(c => new CategoryDto
            {
                Id = c.Id,
                Name = c.Name,
                Description = c.Description,
                ImageUrl = c.ImageUrl,
                BookCount = c.Books.Count(b => !b.IsDeleted),
                CreatedAt = c.CreatedAt
            })
            .FirstOrDefaultAsync(ct);
    }

    public async Task<Category?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _context.Categories
            .FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted, ct);
    }

    public async Task<bool> ExistsByNameAsync(string name, Guid? excludeId = null, CancellationToken ct = default)
    {
        var trimmed = name.Trim().ToLower();
        return await _context.Categories
            .AnyAsync(c => !c.IsDeleted && c.Name.ToLower() == trimmed && (!excludeId.HasValue || c.Id != excludeId.Value), ct);
    }

    public async Task AddAsync(Category category, CancellationToken ct = default)
    {
        await _context.Categories.AddAsync(category, ct);
    }

    public Task UpdateAsync(Category category, CancellationToken ct = default)
    {
        _context.Categories.Update(category);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(Category category, CancellationToken ct = default)
    {
        category.IsDeleted = true;
        _context.Categories.Update(category);
        return Task.CompletedTask;
    }
}
