namespace SmartLibrary.Domain.Common;

/// <summary>
/// Adds audit trail fields (created/updated timestamps) to entities.
/// </summary>
public abstract class AuditableEntity : BaseEntity
{
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
