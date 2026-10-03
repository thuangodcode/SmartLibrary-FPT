using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class Reservation : AuditableEntity, ISoftDeletable
{
    public Guid ReaderId { get; set; }
    public Guid BookId { get; set; }
    public string Status { get; set; } = "pending";
    public DateTime ReservedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? FulfilledAt { get; set; }
    public string? Notes { get; set; }
    public bool IsDeleted { get; set; }

    // Navigation
    public UserProfile Reader { get; set; } = null!;
    public Book Book { get; set; } = null!;
}
