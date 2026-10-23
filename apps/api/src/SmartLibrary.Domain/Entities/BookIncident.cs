using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Domain.Entities;

public class BookIncident : AuditableEntity, ISoftDeletable
{
    public Guid BorrowRecordId { get; set; }
    public Guid BookCopyId { get; set; }
    public Guid ReaderId { get; set; }
    public BookIncidentKind Kind { get; set; }
    public BookIncidentSeverity Severity { get; set; } = BookIncidentSeverity.Unknown;
    public BookIncidentStatus Status { get; set; } = BookIncidentStatus.PendingReview;
    public string? Description { get; set; }
    public decimal? ReplacementValue { get; set; }
    public decimal? AssessedFee { get; set; }
    public bool IncludeOverdue { get; set; }
    public Guid? CompensationFineId { get; set; }
    public Guid? OverdueFineId { get; set; }
    public Guid? ReportedBy { get; set; }
    public Guid? ConfirmedBy { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public bool IsDeleted { get; set; }

    public BorrowRecord BorrowRecord { get; set; } = null!;
    public BookCopy BookCopy { get; set; } = null!;
    public UserProfile Reader { get; set; } = null!;
    public Fine? CompensationFine { get; set; }
    public Fine? OverdueFine { get; set; }
}
