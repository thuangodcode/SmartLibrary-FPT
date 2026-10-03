namespace SmartLibrary.Domain.Common;

/// <summary>
/// Base entity with a UUID primary key.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
}
