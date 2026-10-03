namespace SmartLibrary.Application.Features.Auth.DTOs;

public class RegisterExternalRequest
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public bool AgreeToTerms { get; set; }
}
