using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class Publisher : AuditableEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }
    public bool IsDeleted { get; set; }

    // Navigation
    public ICollection<Book> Books { get; set; } = new List<Book>();
}
