namespace SmartLibrary.Application.Features.Auth.DTOs;

public class ActivateAccountRequest
{
    public string Token { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}
