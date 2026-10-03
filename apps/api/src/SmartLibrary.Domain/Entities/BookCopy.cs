using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Domain.Entities;

public class BookCopy : AuditableEntity, ISoftDeletable
{
    public Guid BookId { get; set; }
    public string Barcode { get; set; } = string.Empty;
    public BookCondition Condition { get; set; } = BookCondition.New;
    public string? Location { get; set; }
    public bool IsAvailable { get; set; } = true;
    public bool IsDeleted { get; set; }

    // Navigation
    public Book Book { get; set; } = null!;
}
