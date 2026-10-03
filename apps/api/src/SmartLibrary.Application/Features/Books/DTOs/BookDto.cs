namespace SmartLibrary.Application.Features.Books.DTOs;

/// <summary>
/// Data transfer object for Book responses.
/// </summary>
public class BookDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Isbn { get; set; }
    public string? Description { get; set; }
    public string? CoverImageUrl { get; set; }
    public int? PublishedYear { get; set; }
    public string Language { get; set; } = string.Empty;
    public int? PageCount { get; set; }
    public int TotalCopies { get; set; }
    public int AvailableCopies { get; set; }
    public decimal AverageRating { get; set; }
    public List<string> AuthorNames { get; set; } = new();
    public List<string> CategoryNames { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
