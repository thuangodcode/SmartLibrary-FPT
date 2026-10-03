using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

/// <summary>
/// Book entity – the core aggregate in the library domain.
/// This is the vertical slice example for the team to follow.
/// </summary>
public class Book : AuditableEntity, ISoftDeletable
{
    public string Title { get; set; } = string.Empty;
    public string? Isbn { get; set; }
    public string? Description { get; set; }
    public string? CoverImageUrl { get; set; }
    public Guid? PublisherId { get; set; }
    public int? PublishedYear { get; set; }
    public string Language { get; set; } = "vi";
    public int? PageCount { get; set; }
    public int TotalCopies { get; set; }
    public int AvailableCopies { get; set; }
    public decimal AverageRating { get; set; }
    public bool IsDeleted { get; set; }

    // Navigation properties
    public Publisher? Publisher { get; set; }
    public ICollection<Author> Authors { get; set; } = new List<Author>();
    public ICollection<Category> Categories { get; set; } = new List<Category>();
    public ICollection<Major> Majors { get; set; } = new List<Major>();
    public ICollection<BookCopy> Copies { get; set; } = new List<BookCopy>();
    public ICollection<Review> Reviews { get; set; } = new List<Review>();
}
