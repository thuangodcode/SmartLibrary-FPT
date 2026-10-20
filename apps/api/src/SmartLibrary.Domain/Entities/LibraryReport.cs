using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class LibraryReport : AuditableEntity, ISoftDeletable
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public Guid TemplateId { get; set; }
    public ReportTemplate Template { get; set; } = null!;
    public Guid SubmittedBy { get; set; }
    public UserProfile Submitter { get; set; } = null!;
    public string Format { get; set; } = "CSV";
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public string Status { get; set; } = "Ready";
    public string Snapshot { get; set; } = "{}";
    public bool IsViewed { get; set; }
    public bool IsApproved { get; set; }
    public Guid? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public bool IsDeleted { get; set; }
    public ICollection<ReportReview> Reviews { get; set; } = new List<ReportReview>();
}
