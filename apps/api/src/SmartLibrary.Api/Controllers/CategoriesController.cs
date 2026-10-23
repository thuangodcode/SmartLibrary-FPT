using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Categories;
using SmartLibrary.Application.Features.Categories.DTOs;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class CategoriesController : ControllerBase
{
    private readonly CategoryService _categoryService;

    public CategoriesController(CategoryService categoryService)
    {
        _categoryService = categoryService;
    }

    /// <summary>
    /// Lấy danh sách tất cả danh mục sách cùng số lượng sách.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct = default)
    {
        var categories = await _categoryService.GetAllAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<CategoryDto>>.Ok(categories));
    }

    /// <summary>
    /// Lấy thông tin chi tiết một danh mục sách theo ID.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct = default)
    {
        var result = await _categoryService.GetByIdAsync(id, ct);
        if (!result.IsSuccess)
        {
            return NotFound(ApiResponse<object>.Fail(result.Error!));
        }

        return Ok(ApiResponse<CategoryDto>.Ok(result.Data!));
    }

    /// <summary>
    /// Tạo mới một danh mục sách (có hỗ trợ upload hình ảnh lên Cloudinary từ máy tính).
    /// </summary>
    [HttpPost]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Create([FromForm] CreateCategoryForm form, CancellationToken ct = default)
    {
        var result = await _categoryService.CreateAsync(form, ct);
        if (!result.IsSuccess)
        {
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        }

        return CreatedAtAction(nameof(GetById), new { id = result.Data!.Id }, ApiResponse<CategoryDto>.Ok(result.Data));
    }

    /// <summary>
    /// Cập nhật thông tin danh mục sách (có hỗ trợ thay đổi hình ảnh Cloudinary).
    /// </summary>
    [HttpPut("{id:guid}")]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Update(Guid id, [FromForm] UpdateCategoryForm form, CancellationToken ct = default)
    {
        var result = await _categoryService.UpdateAsync(id, form, ct);
        if (!result.IsSuccess)
        {
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        }

        return Ok(ApiResponse<CategoryDto>.Ok(result.Data!));
    }

    /// <summary>
    /// Xóa một danh mục sách (soft-delete).
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        var result = await _categoryService.DeleteAsync(id, ct);
        if (!result.IsSuccess)
        {
            return NotFound(ApiResponse<object>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
