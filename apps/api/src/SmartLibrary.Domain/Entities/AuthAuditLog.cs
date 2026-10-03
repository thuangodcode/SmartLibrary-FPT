using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class AuthAuditLog : BaseEntity
{
    public Guid? UserId { get; set; }
    public UserProfile? User { get; set; }
    public string Event { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public string? Metadata { get; set; }
}
