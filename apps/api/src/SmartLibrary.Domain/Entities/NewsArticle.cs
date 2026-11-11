using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class NewsArticle : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public string Category { get; set; } = "Thông báo";
    public string Summary { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public bool IsPinned { get; set; }
    public bool IsPublished { get; set; } = true;
    public string AuthorName { get; set; } = "Ban Quản lý Thư viện FPT";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
