using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Users.DTOs;

public sealed class ReaderListItemDto
{
    public Guid Id { get; init; }
    public string FullName { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string? Phone { get; init; }
    public string? StudentId { get; init; }
    public string? Address { get; init; }
    public DateOnly? DateOfBirth { get; init; }
    public string? AvatarUrl { get; init; }
    public string RoleName { get; init; } = "Reader";
    public AccountStatus Status { get; init; }
    public ReaderType? ReaderType { get; init; }
    public DateTime? MembershipExpiresAt { get; init; }
    public bool IsActive { get; init; }
    public DateTime? LastLoginAt { get; init; }
    public DateTime CreatedAt { get; init; }
    public int BorrowingCount { get; init; }
    public int OverdueCount { get; init; }
    public decimal UnpaidFines { get; init; }
}

public sealed class ReaderStatsDto
{
    public int TotalReaders { get; init; }
    public int ActiveReaders { get; init; }
    public int PendingReaders { get; init; }
    public int SuspendedReaders { get; init; }
}

public sealed class ReaderListResultDto
{
    public IReadOnlyList<ReaderListItemDto> Items { get; init; } = Array.Empty<ReaderListItemDto>();
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalPages { get; init; }
    public ReaderStatsDto Stats { get; init; } = new();
}

public sealed class ReaderRegistrationSummaryDto
{
    public Guid Id { get; init; }
    public DocumentType DocumentType { get; init; }
    public RegistrationRequestStatus Status { get; init; }
    public DateTime SubmittedAt { get; init; }
    public string? FrontDocUrl { get; init; }
    public string? BackDocUrl { get; init; }
    public string? SelfieUrl { get; init; }
}

public sealed class ReaderDetailDto
{
    public Guid Id { get; init; }
    public string FullName { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string? Phone { get; init; }
    public string? StudentId { get; init; }
    public string? Address { get; init; }
    public DateOnly? DateOfBirth { get; init; }
    public string? AvatarUrl { get; init; }
    public string RoleName { get; init; } = "Reader";
    public AccountStatus Status { get; init; }
    public ReaderType? ReaderType { get; init; }
    public DateTime? MembershipExpiresAt { get; init; }
    public bool IsActive { get; init; }
    public DateTime? LastLoginAt { get; init; }
    public DateTime CreatedAt { get; init; }
    public int BorrowCount { get; init; }
    public int ActiveBorrowCount { get; init; }
    public int OverdueCount { get; init; }
    public decimal TotalFines { get; init; }
    public ReaderRegistrationSummaryDto? Registration { get; init; }
}

public sealed class UpdateReaderStatusRequest
{
    public string Status { get; set; } = string.Empty;
    public string? Reason { get; set; }
}

public sealed class ExtendMembershipRequest
{
    public int Months { get; set; } = 12;
}

public sealed class UpdateReaderRequest
{
    public string? FullName { get; set; }
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? StudentId { get; set; }
    public string? ReaderType { get; set; }
}

public sealed class UpdateReaderStatusResultDto
{
    public Guid Id { get; init; }
    public string Status { get; init; } = string.Empty;
}

public sealed class ExtendMembershipResultDto
{
    public Guid Id { get; init; }
    public DateTime? MembershipExpiresAt { get; init; }
}

public sealed class UpdateReaderResultDto
{
    public Guid Id { get; init; }
    public string FullName { get; init; } = string.Empty;
    public string? Phone { get; init; }
    public string? Address { get; init; }
    public string? StudentId { get; init; }
    public ReaderType? ReaderType { get; init; }
}
