namespace SmartLibrary.Application.Interfaces;

public interface IUserProfileService
{
    Task<UserProfileResponse?> GetAsync(Guid userId, CancellationToken cancellationToken);
    Task<UserProfileResponse?> UpdateAsync(
        Guid userId,
        UpdateUserProfileRequest request,
        CancellationToken cancellationToken);
}

/// <summary>Profile information for the authenticated user.</summary>
public sealed record UserProfileResponse(
    Guid Id,
    string Email,
    string FullName,
    string? AvatarUrl,
    string? Phone,
    string? StudentId,
    string? TeacherId,
    string? EmployeeId,
    string? Address,
    DateOnly? DateOfBirth,
    string Role);

/// <summary>Editable profile information supplied by the authenticated user.</summary>
public sealed record UpdateUserProfileRequest(
    string? FullName,
    string? Phone,
    string? Address,
    DateOnly? DateOfBirth,
    bool ClearAvatar,
    string? AvatarUrl);
