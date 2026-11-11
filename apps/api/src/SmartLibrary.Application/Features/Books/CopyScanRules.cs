using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Books;

// Scan results suggest actions; the mutation endpoints still enforce the current database state.
public static class CopyScanRules
{
    public static int ShelfAvailabilityDelta(string? before, string? after)
        => (string.IsNullOrWhiteSpace(after) ? 0 : 1) - (string.IsNullOrWhiteSpace(before) ? 0 : 1);

    public static bool CanReturn(string? loanStatus) => loanStatus is "Borrowed" or "Overdue";

    public static bool CanShelve(bool isAvailable, string? location, BookCondition condition, bool hasOpenLoan)
        => !hasOpenLoan && isAvailable && string.IsNullOrWhiteSpace(location)
           && condition is not (BookCondition.Damaged or BookCondition.Lost);
}
