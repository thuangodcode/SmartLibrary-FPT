using Microsoft.AspNetCore.Http;

namespace SmartLibrary.Application.Features.Categories.DTOs;

public sealed class CreateCategoryForm
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public IFormFile? Image { get; set; }
}
