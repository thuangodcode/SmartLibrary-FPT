using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public sealed class SupportComplaintReply : AuditableEntity
{
    public Guid ComplaintId { get; set; }
    public SupportComplaint Complaint { get; set; } = null!;
    public Guid SenderId { get; set; }
    public UserProfile Sender { get; set; } = null!;
    public string Message { get; set; } = string.Empty;
}
