using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public sealed class StorageShelf : AuditableEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public int Capacity { get; set; } = 100;
    public bool IsDeleted { get; set; }
}
