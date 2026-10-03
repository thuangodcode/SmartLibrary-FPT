using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class Author : AuditableEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string? Biography { get; set; }
    public string? AvatarUrl { get; set; }
    public bool IsDeleted { get; set; }

    // Navigation
    public ICollection<Book> Books { get; set; } = new List<Book>();
}
