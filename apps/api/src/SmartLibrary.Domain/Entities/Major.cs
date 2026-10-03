using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class Major : AuditableEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsDeleted { get; set; }

    // Navigation
    public ICollection<Book> Books { get; set; } = new List<Book>();
}
