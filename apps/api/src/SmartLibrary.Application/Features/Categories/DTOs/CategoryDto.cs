namespace SmartLibrary.Application.Features.Categories.DTOs;

public sealed class CategoryDto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public int BookCount { get; init; }
}
