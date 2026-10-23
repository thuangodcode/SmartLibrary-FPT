using Microsoft.Extensions.Logging;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Categories.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Categories;

public class CategoryService
{
    private readonly ICategoryRepository _categoryRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IStorageService _storageService;
    private readonly ILogger<CategoryService> _logger;

    public CategoryService(
        ICategoryRepository categoryRepository,
        IUnitOfWork unitOfWork,
        IStorageService storageService,
        ILogger<CategoryService> logger)
    {
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
        _storageService = storageService;
        _logger = logger;
    }

    public Task<IReadOnlyList<CategoryDto>> GetAllAsync(CancellationToken ct = default) =>
        _categoryRepository.GetAllWithBookCountAsync(ct);

    public async Task<Result<CategoryDto>> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var category = await _categoryRepository.GetByIdWithBookCountAsync(id, ct);
        if (category == null)
        {
            return Result<CategoryDto>.Failure("Không tìm thấy danh mục sách.");
        }

        return Result<CategoryDto>.Success(category);
    }

    public async Task<Result<CategoryDto>> CreateAsync(CreateCategoryForm form, CancellationToken ct = default)
    {
        var trimmedName = form.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(trimmedName))
        {
            return Result<CategoryDto>.Failure("Tên danh mục không được để trống.");
        }

        if (trimmedName.Length > 255)
        {
            return Result<CategoryDto>.Failure("Tên danh mục không được vượt quá 255 ký tự.");
        }

        if (await _categoryRepository.ExistsByNameAsync(trimmedName, null, ct))
        {
            return Result<CategoryDto>.Failure($"Danh mục sách '{trimmedName}' đã tồn tại.");
        }

        string? imageUrl = null;
        if (form.Image != null && form.Image.Length > 0)
        {
            if (form.Image.Length > 10 * 1024 * 1024)
            {
                return Result<CategoryDto>.Failure("Kích thước tệp hình ảnh không được vượt quá 10 MB.");
            }

            var extension = Path.GetExtension(form.Image.FileName).ToLowerInvariant();
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif" };
            if (!allowedExtensions.Contains(extension))
            {
                return Result<CategoryDto>.Failure("Ảnh chỉ chấp nhận các định dạng JPG, JPEG, PNG, WEBP hoặc GIF.");
            }

            try
            {
                await using var stream = form.Image.OpenReadStream();
                var safeFileName = $"{Guid.NewGuid():N}{extension}";
                imageUrl = await _storageService.UploadFileAsync(stream, safeFileName, "categories", ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload category image to Cloudinary.");
                return Result<CategoryDto>.Failure($"Không thể tải hình ảnh lên Cloudinary: {ex.Message}");
            }
        }

        var category = new Category
        {
            Id = Guid.NewGuid(),
            Name = trimmedName,
            Description = string.IsNullOrWhiteSpace(form.Description) ? null : form.Description.Trim(),
            ImageUrl = imageUrl,
            IsDeleted = false
        };

        await _categoryRepository.AddAsync(category, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        var dto = new CategoryDto
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ImageUrl = category.ImageUrl,
            BookCount = 0,
            CreatedAt = category.CreatedAt
        };

        return Result<CategoryDto>.Success(dto);
    }

    public async Task<Result<CategoryDto>> UpdateAsync(Guid id, UpdateCategoryForm form, CancellationToken ct = default)
    {
        var category = await _categoryRepository.GetByIdAsync(id, ct);
        if (category == null)
        {
            return Result<CategoryDto>.Failure("Không tìm thấy danh mục sách.");
        }

        var trimmedName = form.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(trimmedName))
        {
            return Result<CategoryDto>.Failure("Tên danh mục không được để trống.");
        }

        if (trimmedName.Length > 255)
        {
            return Result<CategoryDto>.Failure("Tên danh mục không được vượt quá 255 ký tự.");
        }

        if (await _categoryRepository.ExistsByNameAsync(trimmedName, id, ct))
        {
            return Result<CategoryDto>.Failure($"Danh mục sách '{trimmedName}' đã tồn tại.");
        }

        category.Name = trimmedName;
        category.Description = string.IsNullOrWhiteSpace(form.Description) ? null : form.Description.Trim();

        if (form.RemoveImage)
        {
            category.ImageUrl = null;
        }

        if (form.Image != null && form.Image.Length > 0)
        {
            if (form.Image.Length > 10 * 1024 * 1024)
            {
                return Result<CategoryDto>.Failure("Kích thước tệp hình ảnh không được vượt quá 10 MB.");
            }

            var extension = Path.GetExtension(form.Image.FileName).ToLowerInvariant();
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif" };
            if (!allowedExtensions.Contains(extension))
            {
                return Result<CategoryDto>.Failure("Ảnh chỉ chấp nhận các định dạng JPG, JPEG, PNG, WEBP hoặc GIF.");
            }

            try
            {
                await using var stream = form.Image.OpenReadStream();
                var safeFileName = $"{Guid.NewGuid():N}{extension}";
                category.ImageUrl = await _storageService.UploadFileAsync(stream, safeFileName, "categories", ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to upload category image to Cloudinary.");
                return Result<CategoryDto>.Failure($"Không thể tải hình ảnh lên Cloudinary: {ex.Message}");
            }
        }

        await _categoryRepository.UpdateAsync(category, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        var dto = await _categoryRepository.GetByIdWithBookCountAsync(id, ct);
        return Result<CategoryDto>.Success(dto ?? new CategoryDto
        {
            Id = category.Id,
            Name = category.Name,
            Description = category.Description,
            ImageUrl = category.ImageUrl,
            BookCount = 0,
            CreatedAt = category.CreatedAt
        });
    }

    public async Task<Result<bool>> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var category = await _categoryRepository.GetByIdAsync(id, ct);
        if (category == null)
        {
            return Result<bool>.Failure("Không tìm thấy danh mục sách.");
        }

        await _categoryRepository.DeleteAsync(category, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return Result<bool>.Success(true);
    }
}
