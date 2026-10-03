using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Domain.Entities;

public class UserProfile : AuditableEntity, ISoftDeletable
{
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string? Phone { get; set; }
    public string? StudentId { get; set; }

    public Guid RoleId { get; set; }
    public Role Role { get; set; } = null!;

    public AccountStatus Status { get; set; } = AccountStatus.PendingVerification;
    public DateTime? LastLoginAt { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsDeleted { get; set; }

    // New properties
    public ReaderType? ReaderType { get; set; }
    public DateTime? MembershipExpiresAt { get; set; }
    public string? Address { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public Guid? CreatedBy { get; set; }
}
