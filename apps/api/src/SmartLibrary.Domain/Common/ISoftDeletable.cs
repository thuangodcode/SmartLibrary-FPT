namespace SmartLibrary.Domain.Common;

/// <summary>
/// Marker interface for entities that support soft delete.
/// </summary>
public interface ISoftDeletable
{
    bool IsDeleted { get; set; }
}
