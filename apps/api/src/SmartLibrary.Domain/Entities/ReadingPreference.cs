using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class ReadingPreference : AuditableEntity
{
    public Guid UserId { get; set; }
    public Guid? CategoryId { get; set; }
    public Guid? MajorId { get; set; }
    public string? PreferredLanguage { get; set; }

    // Navigation
    public UserProfile User { get; set; } = null!;
    public Category? Category { get; set; }
    public Major? Major { get; set; }
}
