namespace SmartLibrary.Application.Features.Books.DTOs;

/// <summary>
/// Request model for creating a new book.
/// </summary>
public class CreateBookRequest
{
    public string Title { get; set; } = string.Empty;
    public string? Isbn { get; set; }
    public string? Description { get; set; }
    public string? CoverImageUrl { get; set; }
    public Guid? PublisherId { get; set; }
    public int? PublishedYear { get; set; }
    public string Language { get; set; } = "vi";
    public int? PageCount { get; set; }
    public List<Guid> AuthorIds { get; set; } = new();
    public List<Guid> CategoryIds { get; set; } = new();
}
