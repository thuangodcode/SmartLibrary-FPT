using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public sealed class SupportChatMessage : AuditableEntity
{
    public Guid ReaderId { get; set; }
    public UserProfile Reader { get; set; } = null!;
    public Guid SenderId { get; set; }
    public UserProfile Sender { get; set; } = null!;
    public string Message { get; set; } = string.Empty;
}
