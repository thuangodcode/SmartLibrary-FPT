using Microsoft.AspNetCore.Http;

namespace SmartLibrary.Application.Features.Books.DTOs;

public class CreateBookForm
{
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? AuthorName { get; set; }
    public string? Isbn { get; set; }
    public string? Description { get; set; }
    public int? PublishedYear { get; set; }
    public string Language { get; set; } = "vi";
    public int? PageCount { get; set; }
    public int TotalCopies { get; set; } = 1;
    public string? Location { get; set; }
    public Guid? CategoryId { get; set; }
    public IFormFile? CoverImage { get; set; }
}
