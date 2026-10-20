using System.Security.Cryptography;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Application.Features.Auth.Services;

public class AuthOtpService : IAuthOtpService
{
    private readonly IEmailService _emailService;
    private readonly IMemoryCache _memoryCache;
    private readonly IRegistrationService _registrationService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthOtpService> _logger;
    private readonly string _connectionString;

    public AuthOtpService(
        IEmailService emailService,
        IMemoryCache memoryCache,
        IRegistrationService registrationService,
        IConfiguration configuration,
        ILogger<AuthOtpService> logger)
    {
        _emailService = emailService;
        _memoryCache = memoryCache;
        _registrationService = registrationService;
        _configuration = configuration;
        _logger = logger;
        _connectionString = configuration.GetConnectionString("DefaultConnection") ?? string.Empty;
    }

    public async Task<Result<SendOtpResultDto>> SendOtpAsync(string email, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email))
            return Result<SendOtpResultDto>.Failure("Vui lòng cung cấp email hợp lệ.");

        var cleanEmail = email.Trim().ToLowerInvariant();
        var otp = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();

        var subject = $"[SmartLibrary] Mã xác thực OTP: {otp}";
        var body = $@"
<div style=""font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);"">
  <div style=""background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 32px 24px; text-align: center;"">
    <h1 style=""color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;"">SmartLibrary FPT</h1>
    <p style=""color: #c7d2fe; margin: 8px 0 0; font-size: 14px;"">Hệ Thống Quản Lý Thư Viện Thông Minh</p>
  </div>
  <div style=""padding: 32px 24px;"">
    <h2 style=""color: #1e293b; font-size: 18px; margin: 0 0 12px; font-weight: 600;"">Mã xác thực email đăng ký</h2>
    <p style=""color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;"">
      Chào bạn, bạn đang thực hiện đăng ký tài khoản tại <strong>SmartLibrary - Đại học FPT</strong>. Dưới đây là mã xác thực OTP của bạn:
    </p>
    <div style=""background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;"">
      <span style=""font-family: monospace; font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #4f46e5; display: inline-block;"">{otp}</span>
    </div>
    <p style=""color: #64748b; font-size: 13px; line-height: 1.5; margin: 0 0 8px;"">
      ⏳ Mã xác thực có hiệu lực trong vòng <strong>10 phút</strong>.
    </p>
    <p style=""color: #e11d48; font-size: 13px; line-height: 1.5; margin: 0;"">
      ⚠️ Tuyệt đối không chia sẻ mã này cho bất kỳ ai để bảo vệ an toàn cho tài khoản.
    </p>
  </div>
  <div style=""background: #f1f5f9; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;"">
    <p style=""color: #94a3b8; font-size: 12px; margin: 0;"">&copy; 2026 SmartLibrary - FPT University. All rights reserved.</p>
  </div>
</div>";

        var emailSent = await _emailService.SendEmailAsync(cleanEmail, subject, body, ct);

        if (!emailSent)
        {
            _logger.LogError("Failed to send OTP verification email to {Email}", cleanEmail);
            return Result<SendOtpResultDto>.Failure("Không thể gửi email chứa mã OTP. Vui lòng kiểm tra lại địa chỉ email hoặc thử lại sau.");
        }

        _memoryCache.Set($"reg_otp:{cleanEmail}", otp, TimeSpan.FromMinutes(10));
        _memoryCache.Remove($"reg_verified:{cleanEmail}");

        return Result<SendOtpResultDto>.Success(new SendOtpResultDto
        {
            Message = "Mã xác thực đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư đến hoặc mục thư rác.",
            Email = cleanEmail
            // Otp is intentionally NOT returned to client
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

    public async Task<Result<bool>> SendPasswordResetOtpAsync(string email, string? clientOrigin = null, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(email))
            return Result<bool>.Failure("Vui lòng cung cấp địa chỉ email hợp lệ.");

        var cleanEmail = email.Trim().ToLowerInvariant();

        // 1. Look up user in database
        Guid? userId = null;
        string fullName = "Quý bạn đọc";

        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                SELECT u.id, COALESCE(p.full_name, 'Quý bạn đọc') AS full_name
                FROM auth.users u
                LEFT JOIN profiles p ON p.id = u.id
                WHERE LOWER(u.email) = LOWER(@email)
                LIMIT 1;", conn);
            cmd.Parameters.AddWithValue("email", cleanEmail);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                userId = reader.GetGuid(0);
                if (!reader.IsDBNull(1))
                    fullName = reader.GetString(1);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking user existence for password reset: {Email}", cleanEmail);
        }

        // To prevent account enumeration, if user is not found, return Success with standard message
        if (!userId.HasValue)
        {
            _logger.LogInformation("Password reset requested for non-existing email: {Email}", cleanEmail);
            return Result<bool>.Success(true);
        }

        // 2. Generate secure token and OTP
        var resetOtp = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
        var resetToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();

        // 3. Store in MemoryCache for 15 minutes
        _memoryCache.Set($"pwd_reset_token:{resetToken}", (userId.Value, cleanEmail), TimeSpan.FromMinutes(15));
        _memoryCache.Set($"pwd_reset_otp:{cleanEmail}", (resetOtp, resetToken, userId.Value), TimeSpan.FromMinutes(15));

        // 4. Construct reset link
        string webOrigin;
        if (!string.IsNullOrWhiteSpace(clientOrigin))
        {
            webOrigin = clientOrigin.TrimEnd('/');
        }
        else
        {
            var allowedOrigins = _configuration["Cors:AllowedOrigins"]?
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var vercelOrigin = allowedOrigins?.FirstOrDefault(o => o.Contains(".vercel.app", StringComparison.OrdinalIgnoreCase));
            webOrigin = (vercelOrigin ?? allowedOrigins?.FirstOrDefault() ?? "http://localhost:5173").TrimEnd('/');
        }

        var resetLink = $"{webOrigin}/reset-password?email={Uri.EscapeDataString(cleanEmail)}&token={resetToken}";

        // 5. Send rich HTML email
        var subject = $"[SmartLibrary] Yêu cầu đặt lại mật khẩu - Mã OTP: {resetOtp}";
        var body = $@"
<div style=""font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);"">
  <div style=""background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 32px 24px; text-align: center;"">
    <h1 style=""color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;"">SmartLibrary FPT</h1>
    <p style=""color: #c7d2fe; margin: 8px 0 0; font-size: 14px;"">Yêu Cầu Khôi Phục & Đặt Lại Mật Khẩu</p>
  </div>
  <div style=""padding: 32px 24px;"">
    <h2 style=""color: #1e293b; font-size: 18px; margin: 0 0 12px; font-weight: 600;"">Xin chào {fullName},</h2>
    <p style=""color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px;"">
      Hệ thống <strong>SmartLibrary - Đại học FPT</strong> nhận được yêu cầu đặt lại mật khẩu cho tài khoản liên kết với địa chỉ email <strong>{cleanEmail}</strong>.
    </p>

    <div style=""text-align: center; margin: 28px 0;"">
      <a href=""{resetLink}"" style=""background: #4f46e5; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 600; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);"">
        Đặt Lại Mật Khẩu Ngay
      </a>
    </div>

    <p style=""color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 16px; text-align: center;"">
      Hoặc nếu bạn đang ở trang đặt lại mật khẩu, bạn có thể nhập mã OTP 6 chữ số dưới đây:
    </p>

    <div style=""background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;"">
      <span style=""font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; display: inline-block;"">{resetOtp}</span>
    </div>

    <p style=""color: #64748b; font-size: 12px; line-height: 1.5; margin: 0 0 8px;"">
      ⏳ Liên kết và mã OTP này chỉ có hiệu lực trong vòng <strong>15 phút</strong>.
    </p>
    <p style=""color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;"">
      🔒 Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email. Mật khẩu hiện tại của bạn vẫn an toàn.
    </p>
  </div>
  <div style=""background: #f1f5f9; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;"">
    <p style=""color: #94a3b8; font-size: 12px; margin: 0;"">&copy; 2026 SmartLibrary - FPT University. All rights reserved.</p>
  </div>
</div>";

        var emailSent = await _emailService.SendEmailAsync(cleanEmail, subject, body, ct);
        if (!emailSent)
        {
            _logger.LogError("Failed to send password reset email to {Email}", cleanEmail);
            return Result<bool>.Failure("Không thể gửi email đặt lại mật khẩu lúc này. Vui lòng thử lại sau.");
        }

        _logger.LogInformation("Password reset email sent successfully to {Email}", cleanEmail);
        return Result<bool>.Success(true);
    }

    public async Task<Result<bool>> ResetPasswordWithOtpOrTokenAsync(
        string? email,
        string? token,
        string? otp,
        string newPassword,
        CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(newPassword))
            return Result<bool>.Failure("Vui lòng nhập mật khẩu mới.");

        Guid? targetUserId = null;
        string? targetEmail = null;

        // 1. Verify by Token if present
        if (!string.IsNullOrWhiteSpace(token))
        {
            var cleanToken = token.Trim().ToLowerInvariant();
            if (_memoryCache.TryGetValue($"pwd_reset_token:{cleanToken}", out (Guid UserId, string Email) cachedData))
            {
                targetUserId = cachedData.UserId;
                targetEmail = cachedData.Email;
            }
        }

        // 2. If token verification didn't match, try OTP verification with Email
        if (!targetUserId.HasValue && !string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(otp))
        {
            var cleanEmail = email.Trim().ToLowerInvariant();
            if (_memoryCache.TryGetValue($"pwd_reset_otp:{cleanEmail}", out (string Otp, string Token, Guid UserId) otpData))
            {
                if (otpData.Otp == otp.Trim())
                {
                    targetUserId = otpData.UserId;
                    targetEmail = cleanEmail;
                }
            }
        }

        if (!targetUserId.HasValue)
        {
            return Result<bool>.Failure("Mã xác thực OTP hoặc liên kết đặt lại mật khẩu không chính xác hoặc đã hết hạn. Vui lòng yêu cầu lại.");
        }

        // 3. Update password in PostgreSQL auth.users table using pgcrypto crypt()
        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync(ct);

            await using var cmd = new NpgsqlCommand(@"
                UPDATE auth.users
                SET encrypted_password = crypt(@newPassword, gen_salt('bf')),
                    updated_at = NOW()
                WHERE id = @userId;", conn);
            cmd.Parameters.AddWithValue("newPassword", newPassword);
            cmd.Parameters.AddWithValue("userId", targetUserId.Value);

            var rowsAffected = await cmd.ExecuteNonQueryAsync(ct);
            if (rowsAffected == 0)
            {
                return Result<bool>.Failure("Không tìm thấy tài khoản người dùng để cập nhật mật khẩu.");
            }

            _logger.LogInformation("Password reset successfully for user ID: {UserId}, Email: {Email}", targetUserId.Value, targetEmail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to update password in auth.users for user {UserId}", targetUserId.Value);
            return Result<bool>.Failure("Lỗi hệ thống khi cập nhật mật khẩu. Vui lòng thử lại sau.");
        }

        // 4. Invalidate tokens from cache
        if (!string.IsNullOrWhiteSpace(token))
            _memoryCache.Remove($"pwd_reset_token:{token.Trim().ToLowerInvariant()}");
        if (!string.IsNullOrWhiteSpace(targetEmail))
            _memoryCache.Remove($"pwd_reset_otp:{targetEmail}");

        return Result<bool>.Success(true);
    }
}
