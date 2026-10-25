namespace SmartLibrary.Application.Features.Circulation.DTOs;

public class CirculationStatsDto
{
    public int Borrowed { get; init; }
    public int BorrowedDelta { get; init; }
    public int Returned { get; init; }
    public int ReturnedDelta { get; init; }
    public int Overdue { get; init; }
    public int OverdueDelta { get; init; }
    public decimal UnpaidFines { get; init; }
    public decimal UnpaidFinesDelta { get; init; }
    public int DueSoon { get; init; }
    public int SuggestedFinePerDay { get; init; }
}

public record CirculationLoanDto
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public DateTime? BorrowDate { get; init; }
    public DateTime? DueDate { get; init; }
    public DateTime? PickupAt { get; init; }
    public DateTime? AcceptedAt { get; init; }
    public DateTime? ReturnDate { get; init; }
    public DateTime CreatedAt { get; init; }
    public string Status { get; init; } = string.Empty;
    public string DisplayStatus { get; init; } = string.Empty;
    public int OverdueDays { get; init; }
    public Guid ReaderId { get; init; }
    public string ReaderName { get; init; } = string.Empty;
    public string? ReaderEmail { get; init; }
    public string? StudentId { get; init; }
    public string? LibrarianName { get; init; }
    public Guid BookCopyId { get; init; }
    public string Barcode { get; init; } = string.Empty;
    public string BookTitle { get; init; } = string.Empty;
    public string? CopyCondition { get; init; }
    public decimal? SuggestedFine { get; init; }
    public bool HasOpenFine { get; init; }
    public bool HasFine { get; init; }
    public int RenewalCount { get; init; }
    public bool CanRenew { get; init; }
    public string? RenewalUnavailableReason { get; init; }
    public bool RequiresApproval { get; init; }
    public string? Language { get; init; }
    public decimal? CreatedFineAmount { get; init; }
    public bool IncidentOpened { get; init; }
    public Guid? ReadyReservationReaderId { get; init; }
    public Guid? ReadyReservationBookId { get; init; }
    public string? ReadyReservationBookTitle { get; init; }
}

public record CirculationSettings
{
    public int? MaxBooks { get; init; }
    public int? MaxBooksStudent { get; init; }
    public int? MaxBooksLecturer { get; init; }
    public int BorrowDays { get; init; } = 14;
    public int BorrowDaysVi { get; init; } = 7;
    public int BorrowDaysForeign { get; init; } = 14;
    public int? MaxRenewals { get; init; }
    public int RenewalDaysVi { get; init; } = 7;
    public int RenewalDaysForeign { get; init; } = 14;
    public bool BlockRenewIfOverdue { get; init; }
    public bool BlockRenewIfReserved { get; init; }
    public int SelfRenewBeforeDays { get; init; } = 1;
    public int SelfRenewAfterDays { get; init; } = 1;
    public bool TextbookRequiresApproval { get; init; }
    public int FinePerDay { get; init; }
    public bool RestrictIfUnpaid { get; init; } = true;
    public bool AllowReservation { get; init; } = true;
    public int? HoldHours { get; init; }
    public int PickupDeadlineHours { get; init; } = 24;
    public int PickupSlotMinutes { get; init; } = 30;
    public int PickupCapacityPerSlot { get; init; } = 5;
    public int PickupDaysAhead { get; init; } = 14;
    public bool BlockBorrowIfOverdue { get; init; } = true;
}

public record PickupSlotDto(DateTimeOffset PickupAt, int RemainingCapacity, int Capacity);

public sealed record CirculationReminderDto(
    Guid ReaderId, Guid EntityId, Guid BookId, string BookTitle, DateTime? DueAt);

public sealed record ExpiredReservationDto(
    Guid Id, Guid ReaderId, Guid BookId, string BookTitle, DateTime? ExpiresAt);

public class CirculationCopyIssueDto
{
    public Guid? IncidentId { get; init; }
    public string Barcode { get; init; } = string.Empty;
    public string BookTitle { get; init; } = string.Empty;
    public string Type { get; init; } = string.Empty;
    public string ReaderName { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
}

public record CirculationIncidentDto
{
    public Guid Id { get; init; }
    public Guid BorrowRecordId { get; init; }
    public Guid ReaderId { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string Severity { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public string Barcode { get; init; } = string.Empty;
    public string BookTitle { get; init; } = string.Empty;
    public string ReaderName { get; init; } = string.Empty;
    public int OverdueDays { get; init; }
    public decimal? SuggestedOverdueFine { get; init; }
    public decimal? ReplacementValue { get; init; }
    public decimal? AssessedFee { get; init; }
    public decimal CompensationAmount { get; init; }
    public decimal OverdueAmount { get; init; }
    public decimal TotalAmount { get; init; }
    public Guid? CompensationFineId { get; init; }
    public Guid? OverdueFineId { get; init; }
    public string? Description { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? ConfirmedAt { get; init; }
}

public class ConfirmIncidentRequest
{
    public string Severity { get; set; } = string.Empty;
    public decimal? ReplacementValue { get; set; }
    public decimal? AssessedFee { get; set; }
    public bool ApplyOverdue { get; set; }
    public string? Notes { get; set; }
}

public class RejectIncidentRequest
{
    public string? Notes { get; set; }
    public bool RestoreCopy { get; set; } = true;
}

public class CirculationLoanListDto
{
    public IReadOnlyList<CirculationLoanDto> Items { get; init; } = [];
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalPages { get; init; }
}

public class CirculationFineDto
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public Guid BorrowRecordId { get; init; }
    public Guid ReaderId { get; init; }
    public string ReaderName { get; init; } = string.Empty;
    public string BookTitle { get; init; } = string.Empty;
    public string Barcode { get; init; } = string.Empty;
    public decimal Amount { get; init; }
    public string Reason { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime? PaidAt { get; init; }
}

public class CirculationFineListDto
{
    public IReadOnlyList<CirculationFineDto> Items { get; init; } = [];
    public int TotalCount { get; init; }
}

public class CirculationReservationDto
{
    public Guid Id { get; init; }
    public Guid ReaderId { get; init; }
    public Guid BookId { get; init; }
    public string ReaderName { get; init; } = string.Empty;
    public string BookTitle { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateTime ReservedAt { get; init; }
    public DateTime? ExpiresAt { get; init; }
}

public class CirculationActivityDto
{
    public Guid Id { get; init; }
    public DateTime At { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string Barcode { get; init; } = string.Empty;
    public string ReaderName { get; init; } = string.Empty;
}

public class CheckoutRequest
{
    public string ReaderKey { get; set; } = string.Empty;
    public string Barcode { get; set; } = string.Empty;
}

public class ReturnLoanRequest
{
    public string Barcode { get; set; } = string.Empty;
    public string? Condition { get; set; }
}

public class RecordFineRequest
{
    public Guid BorrowRecordId { get; set; }
    public decimal Amount { get; set; }
    public string Reason { get; set; } = "Phạt quá hạn";
}

public class CreateReservationRequest
{
    public string ReaderKey { get; set; } = string.Empty;
    public string Barcode { get; set; } = string.Empty;
}

public class BorrowRequest
{
    public string Barcode { get; set; } = string.Empty;
    public DateTimeOffset PickupAt { get; set; }
}

/// <summary>Request to borrow an available copy of a book.</summary>
public sealed record RequestBookBorrowRequest(Guid BookId, DateTimeOffset PickupAt);

/// <summary>Request to join the reservation queue for an unavailable book.</summary>
public sealed record RequestBookReservationRequest(Guid BookId);

/// <summary>Reader suggestion shown while a librarian searches the reservation form.</summary>
public sealed record CirculationReaderOptionDto(Guid Id, string FullName, string? StudentId, string Email);

/// <summary>Book suggestion shown while a librarian searches the reservation form.</summary>
public sealed record CirculationBookOptionDto(Guid Id, string Title, string Code);

/// <summary>Creates a reservation for a selected reader and book.</summary>
public sealed record CreateLibrarianReservationRequest(Guid ReaderId, Guid BookId);

public class ReportIncidentRequest
{
    public string Kind { get; set; } = "Lost";
    public string? Notes { get; set; }
}
