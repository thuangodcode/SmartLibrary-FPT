using System.Security.Cryptography;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Application.Features.Auth.Services;

public class AuthOtpService : IAuthOtpService
{
    private readonly IEmailService _emailService;
    private readonly IMemoryCache _memoryCache;
    private readonly IRegistrationService _registrationService;

    public AuthOtpService(
        IEmailService emailService,
        IMemoryCache memoryCache,
        IRegistrationService registrationService)
    {
        _emailService = emailService;
        _memoryCache = memoryCache;
        _registrationService = registrationService;
    }

    public async Task<Result<SendOtpResultDto>> SendOtpAsync(string email, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email))
            return Result<SendOtpResultDto>.Failure("Vui lòng cung cấp email hợp lệ.");

        var cleanEmail = email.Trim().ToLowerInvariant();
        var otp = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();

        var emailSent = await _emailService.SendEmailAsync(
            cleanEmail,
            "SmartLibrary - Mã xác thực Email đăng ký tài khoản",
            $"Mã xác thực OTP của bạn là: {otp}. Mã có hiệu lực trong vòng 10 phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.");

        _memoryCache.Set($"reg_otp:{cleanEmail}", otp, TimeSpan.FromMinutes(10));
        _memoryCache.Remove($"reg_verified:{cleanEmail}");

        return Result<SendOtpResultDto>.Success(new SendOtpResultDto
        {
            Message = emailSent
                ? "Mã xác thực đã được gửi đến email của bạn."
                : "Hệ thống chưa cấu hình SMTP để gửi mail thật. Vui lòng dùng mã OTP hiển thị trên màn hình để tiếp tục.",
            Email = cleanEmail,
            Otp = otp
        });
    }

    public Result<VerifyOtpResultDto> VerifyOtp(string email, string otp)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(otp))
            return Result<VerifyOtpResultDto>.Failure("Vui lòng cung cấp email và mã OTP.");

        var cleanEmail = email.Trim().ToLowerInvariant();
        if (!_memoryCache.TryGetValue($"reg_otp:{cleanEmail}", out string? cachedOtp) || cachedOtp != otp.Trim())
            return Result<VerifyOtpResultDto>.Failure("Mã xác thực OTP không chính xác hoặc đã hết hạn.");

        _memoryCache.Set($"reg_verified:{cleanEmail}", true, TimeSpan.FromMinutes(30));
        return Result<VerifyOtpResultDto>.Success(new VerifyOtpResultDto
        {
            Verified = true,
            Message = "Xác minh email thành công!"
        });
    }

    public async Task<Result<RegisterExternalReaderResultDto>> RegisterExternalReaderAsync(
        RegisterExternalReaderRequest request,
        IFormFile? front,
        IFormFile? back,
        IFormFile? selfie,
        string? otp,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return Result<RegisterExternalReaderResultDto>.Failure("Vui lòng nhập địa chỉ email.");

        if (string.IsNullOrEmpty(request.Password))
            return Result<RegisterExternalReaderResultDto>.Failure("Vui lòng nhập mật khẩu.");

        if (string.IsNullOrWhiteSpace(request.FullName))
            return Result<RegisterExternalReaderResultDto>.Failure("Vui lòng nhập họ và tên.");

        if (front is null || front.Length == 0)
            return Result<RegisterExternalReaderResultDto>.Failure("Vui lòng tải lên ảnh mặt trước giấy tờ.");

        var cleanEmail = request.Email.Trim().ToLowerInvariant();
        var isVerified = _memoryCache.TryGetValue($"reg_verified:{cleanEmail}", out bool verified) && verified;
        if (!isVerified && !string.IsNullOrWhiteSpace(otp))
        {
            if (_memoryCache.TryGetValue($"reg_otp:{cleanEmail}", out string? cached) && cached == otp.Trim())
                isVerified = true;
        }

        if (!isVerified)
        {
            return Result<RegisterExternalReaderResultDto>.Failure(
                "Email chưa được xác thực bằng mã OTP. Vui lòng quay lại bước xác minh email.");
        }

        var registrationId = await _registrationService.RegisterExternalReaderAsync(request, front, back, selfie, ct);
        _memoryCache.Remove($"reg_otp:{cleanEmail}");
        _memoryCache.Remove($"reg_verified:{cleanEmail}");

        return Result<RegisterExternalReaderResultDto>.Success(new RegisterExternalReaderResultDto
        {
            RegistrationId = registrationId
        });
    }
}
