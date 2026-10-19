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

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct = default)
    {
        var categories = await _categoryService.GetAllAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<CategoryDto>>.Ok(categories));
    }
}
