using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class Category : AuditableEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid? ParentId { get; set; }
    public bool IsDeleted { get; set; }

    // Navigation
    public Category? Parent { get; set; }
    public ICollection<Category> Children { get; set; } = new List<Category>();
    public ICollection<Book> Books { get; set; } = new List<Book>();
}
