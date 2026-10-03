using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Domain.Entities;

public class BorrowRecord : AuditableEntity, ISoftDeletable
{
    public Guid ReaderId { get; set; }
    public Guid BookCopyId { get; set; }
    public Guid? LibrarianId { get; set; }
    public BorrowStatus Status { get; set; } = BorrowStatus.Pending;
    public DateTime? BorrowDate { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime? ReturnDate { get; set; }
    public BookCondition? ReturnCondition { get; set; }
    public int RenewalCount { get; set; }
    public string? Notes { get; set; }
    public bool IsDeleted { get; set; }

    // Navigation
    public UserProfile Reader { get; set; } = null!;
    public BookCopy BookCopy { get; set; } = null!;
    public UserProfile? Librarian { get; set; }
}
