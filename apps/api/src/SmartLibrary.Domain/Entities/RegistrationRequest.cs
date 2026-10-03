using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Domain.Entities;

public class RegistrationRequest : AuditableEntity
{
    public Guid UserId { get; set; }
    public UserProfile User { get; set; } = null!;

    public DocumentType DocumentType { get; set; }
    public int AttemptNo { get; set; } = 1;
    public RegistrationRequestStatus Status { get; set; } = RegistrationRequestStatus.Submitted;
    
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    
    public Guid? ReviewedById { get; set; }
    public UserProfile? ReviewedBy { get; set; }
    
    public DateTime? ReviewedAt { get; set; }
    public string? RejectReason { get; set; }
    public string? Note { get; set; }

    public ICollection<IdentityDocument> Documents { get; set; } = new List<IdentityDocument>();
}
