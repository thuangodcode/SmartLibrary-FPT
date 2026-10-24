using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public sealed class SupportRequestType : AuditableEntity
{
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
