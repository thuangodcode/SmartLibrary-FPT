using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class ReportRequest : AuditableEntity
{
    public Guid LibrarianId { get; set; }
    public UserProfile Librarian { get; set; } = null!;
    public Guid RequestedBy { get; set; }
    public UserProfile Requester { get; set; } = null!;
    public Guid TemplateId { get; set; }
    public ReportTemplate Template { get; set; } = null!;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public string? Name { get; set; }
    public string Status { get; set; } = "Pending";
    public Guid? ReportId { get; set; }
    public LibraryReport? Report { get; set; }
    public ICollection<LibraryReport> Reports { get; set; } = new List<LibraryReport>();
}
