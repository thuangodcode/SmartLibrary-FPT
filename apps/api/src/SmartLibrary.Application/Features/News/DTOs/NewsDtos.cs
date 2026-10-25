using Microsoft.AspNetCore.Http;

namespace SmartLibrary.Application.Features.News.DTOs;

public class NewsArticleDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public bool IsPinned { get; set; }
    public bool IsPublished { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateNewsForm
{
    public string Title { get; set; } = string.Empty;
    public string Category { get; set; } = "Thông báo";
    public string Summary { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public bool IsPinned { get; set; }
    public string? AuthorName { get; set; }
    public IFormFile? Image { get; set; }
}

public class UpdateNewsForm
{
    public string Title { get; set; } = string.Empty;
    public string Category { get; set; } = "Thông báo";
    public string Summary { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public bool IsPinned { get; set; }
    public string? AuthorName { get; set; }
    public IFormFile? Image { get; set; }
    public bool RemoveImage { get; set; }
}
