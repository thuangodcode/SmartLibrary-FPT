using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class Review : AuditableEntity, ISoftDeletable
{
    public Guid BookId { get; set; }
    public Guid ReaderId { get; set; }
    public int Rating { get; set; }
    public string? Comment { get; set; }
    public bool IsDeleted { get; set; }

    // Navigation
    public Book Book { get; set; } = null!;
    public UserProfile Reader { get; set; } = null!;
}
