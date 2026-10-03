using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Domain.Entities;

public class Fine : AuditableEntity, ISoftDeletable
{
    public Guid BorrowRecordId { get; set; }
    public Guid ReaderId { get; set; }
    public decimal Amount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public FineStatus Status { get; set; } = FineStatus.Pending;
    public DateTime? PaidAt { get; set; }
    public string? Notes { get; set; }
    public bool IsDeleted { get; set; }

    // Navigation
    public BorrowRecord BorrowRecord { get; set; } = null!;
    public UserProfile Reader { get; set; } = null!;
}
