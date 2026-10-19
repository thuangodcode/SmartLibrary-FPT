using Microsoft.AspNetCore.Http;
using SmartLibrary.Application.Common;

namespace SmartLibrary.Application.Interfaces;

public interface IAuthOtpService
{
    Task<Result<SendOtpResultDto>> SendOtpAsync(string email, CancellationToken ct = default);
    Result<VerifyOtpResultDto> VerifyOtp(string email, string otp);
    Task<Result<RegisterExternalReaderResultDto>> RegisterExternalReaderAsync(
        RegisterExternalReaderRequest request,
        IFormFile? front,
        IFormFile? back,
        IFormFile? selfie,
        string? otp,
        CancellationToken ct = default);
}

public sealed class SendOtpResultDto
{
    public string Message { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string Otp { get; init; } = string.Empty;
}

public sealed class VerifyOtpResultDto
{
    public bool Verified { get; init; }
    public string Message { get; init; } = string.Empty;
}

public sealed class RegisterExternalReaderResultDto
{
    public Guid RegistrationId { get; init; }
}
