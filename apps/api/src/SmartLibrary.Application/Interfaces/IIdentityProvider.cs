using SmartLibrary.Application.Common;

namespace SmartLibrary.Application.Interfaces;

public interface IIdentityProvider
{
    Task<(string UserId, bool EmailConfirmed)> RegisterUserAsync(string email, string password, string fullName, string? studentId);
    Task<AuthResult> LoginWithEmailPasswordAsync(string email, string password);
    Task<AuthResult> RefreshTokenAsync(string refreshToken);
    Task LogoutAsync(string accessToken);
    Task SendPasswordResetEmailAsync(string email);
    Task ResetPasswordAsync(string token, string newPassword);
    Task ChangePasswordAsync(string userId, string currentPassword, string newPassword);
    Task ResendVerificationEmailAsync(string email);
    Task<object?> GetUserProfileWithPermissionsAsync(string userId);
}

public class AuthResult
{
    public bool IsSuccess { get; set; }
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public int ExpiresIn { get; set; }
    public string? UserId { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
}
