namespace SmartLibrary.Application.Features.Statistics.DTOs;

public sealed class LibrarianDashboardStatsDto
{
    public int PendingRegistrations { get; init; }
    public int TotalReaders { get; init; }
    public int TotalBooks { get; init; }
    public int AvailableCopies { get; init; }
    public int BorrowedCount { get; init; }
    public int OverdueCount { get; init; }
}

public sealed class AdminOverviewDto
{
    public int ActiveReaders { get; init; }
    public int TotalBooks { get; init; }
    public long TotalCopies { get; init; }
    public int ActiveLoans { get; init; }
    public int OverdueLoans { get; init; }
    public int PendingRegistrations { get; init; }
    public int PendingBorrowRequests { get; init; }
    public IReadOnlyList<MonthlyBorrowingDto> MonthlyBorrowing { get; init; } = Array.Empty<MonthlyBorrowingDto>();
    public IReadOnlyList<BorrowStatusCountDto> BorrowStatusBreakdown { get; init; } = Array.Empty<BorrowStatusCountDto>();
}

public sealed class MonthlyBorrowingDto
{
    public int Year { get; init; }
    public int Month { get; init; }
    public int Count { get; init; }
}

public sealed class BorrowStatusCountDto
{
    public string Status { get; init; } = string.Empty;
    public int Count { get; init; }
}
