using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public sealed class SupportComplaint : AuditableEntity
{
    public Guid ReaderId { get; set; }
    public UserProfile Reader { get; set; } = null!;
    public Guid RequestTypeId { get; set; }
    public SupportRequestType RequestType { get; set; } = null!;
    public string Content { get; set; } = string.Empty;
    public string? AttachmentUrl { get; set; }
    public string Status { get; set; } = "Pending";
    public Guid? AcceptedById { get; set; }
    public UserProfile? AcceptedBy { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public DateTimeOffset? DueAt { get; set; }
    public DateTime? FirstRespondedAt { get; set; }
    public ICollection<SupportComplaintReply> Replies { get; set; } = new List<SupportComplaintReply>();
}
