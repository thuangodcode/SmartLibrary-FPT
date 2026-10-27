namespace SmartLibrary.Application.Interfaces;

public interface IUserProfileService
{
    Task<UserProfileResponse?> GetAsync(Guid userId, CancellationToken cancellationToken);
    Task<UserProfileResponse?> UpdateAsync(
        Guid userId,
        UpdateUserProfileRequest request,
        CancellationToken cancellationToken);
    Task<string> SendEmailVerificationOtpAsync(
        Guid userId,
        string email,
        CancellationToken cancellationToken);
    Task<UserProfileResponse?> VerifyAndUpdateEmailAsync(
        Guid userId,
        string email,
        string otp,
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
    string Role,
    string? FrontDocUrl = null,
    string? BackDocUrl = null,
    string? SelfieDocUrl = null,
    string? DocumentType = null);

/// <summary>Editable profile information supplied by the authenticated user.</summary>
public sealed record UpdateUserProfileRequest(
    string? FullName,
    string? Phone,
    string? Address,
    DateOnly? DateOfBirth,
    bool ClearAvatar,
    string? AvatarUrl);

/// <summary>Request to send an email verification code to a student's personal email.</summary>
public sealed record SendProfileEmailVerificationRequest(string Email);

/// <summary>Request to verify and save a student's personal email address.</summary>
public sealed record VerifyProfileEmailRequest(string Email, string Otp);
