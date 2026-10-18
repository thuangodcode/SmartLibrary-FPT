using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Auth.Commands;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IIdentityProvider _identityProvider;
    private readonly IEmailService _emailService;
    private readonly IMemoryCache _memoryCache;
    private readonly IRegistrationService _registrationService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IIdentityProvider identityProvider,
        IEmailService emailService,
        IMemoryCache memoryCache,
        IRegistrationService registrationService,
        ILogger<AuthController> logger)
    {
        _identityProvider = identityProvider;
        _emailService = emailService;
        _memoryCache = memoryCache;
        _registrationService = registrationService;
        _logger = logger;
    }

    /// <summary>
    /// Đăng ký tài khoản sinh viên (Reader)
    /// </summary>
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterCommand command)
    {
        var (userId, isConfirmed) = await _identityProvider.RegisterUserAsync(
            command.Email, command.Password, command.FullName, command.StudentId
        );

        return Ok(ApiResponse<object>.Ok(
            new { userId, emailConfirmed = isConfirmed },
            new { message = "Đăng ký tài khoản thành công. Vui lòng kiểm tra email để xác minh mã OTP." }
        ));
    }

    /// <summary>
    /// Đăng nhập hệ thống (Email, tên đăng nhập hoặc mã sinh viên + mật khẩu)
    /// </summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginCommand command)
    {
        var result = await _identityProvider.LoginWithEmailPasswordAsync(command.Email, command.Password);

        if (!result.IsSuccess)
        {
            if (result.ErrorCode == "AUTH_SERVICE_UNAVAILABLE")
                return StatusCode(StatusCodes.Status503ServiceUnavailable, ApiResponse<object>.Fail(result.ErrorMessage ?? "Dịch vụ xác thực tạm thời không khả dụng."));

            return Unauthorized(ApiResponse<object>.Fail(result.ErrorMessage ?? "Đăng nhập thất bại."));
        }

        var isMobile = Request.Headers["X-Client-Type"] == "mobile";
        if (!isMobile && !string.IsNullOrEmpty(result.RefreshToken))
        {
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Lax,
                Expires = DateTimeOffset.UtcNow.AddDays(7)
            };
            Response.Cookies.Append("refreshToken", result.RefreshToken, cookieOptions);
        }

        // Fetch user profile with role and permissions from DB
        object? userProfile = null;
        if (!string.IsNullOrEmpty(result.UserId))
        {
            userProfile = await _identityProvider.GetUserProfileWithPermissionsAsync(result.UserId);
        }
        if (userProfile is null)
            return Unauthorized(ApiResponse<object>.Fail("Tài khoản không hoạt động hoặc chưa được cấp quyền truy cập."));

        var responseData = new
        {
            accessToken = result.AccessToken,
            refreshToken = isMobile ? result.RefreshToken : null,
            expiresIn = result.ExpiresIn,
            user = userProfile
        };

        return Ok(ApiResponse<object>.Ok(responseData));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetCurrentUser()
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));

        var userProfile = await _identityProvider.GetUserProfileWithPermissionsAsync(userId);
        if (userProfile is null)
            return Unauthorized(ApiResponse<object>.Fail("Tài khoản không hoạt động hoặc chưa được cấp quyền truy cập."));

        return Ok(ApiResponse<object>.Ok(new { user = userProfile }));
    }

    /// <summary>
    /// Cấp lại Access Token mới bằng Refresh Token
    /// </summary>
    [HttpPost("refresh")]
    public async Task<IActionResult> RefreshToken([FromBody] RefreshRequest? request)
    {
        var refreshToken = request?.RefreshToken ?? Request.Cookies["refreshToken"];
        if (string.IsNullOrEmpty(refreshToken))
        {
            return BadRequest(ApiResponse<object>.Fail("Mã Refresh Token không hợp lệ."));
        }

        var result = await _identityProvider.RefreshTokenAsync(refreshToken);
        if (!result.IsSuccess)
        {
            return Unauthorized(ApiResponse<object>.Fail(result.ErrorMessage ?? "Phiên hết hạn."));
        }

        var isMobile = Request.Headers["X-Client-Type"] == "mobile";
        if (!isMobile && !string.IsNullOrEmpty(result.RefreshToken))
        {
            Response.Cookies.Append("refreshToken", result.RefreshToken, new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Lax,
                Expires = DateTimeOffset.UtcNow.AddDays(7)
            });
        }

        return Ok(ApiResponse<object>.Ok(new
        {
            accessToken = result.AccessToken,
            refreshToken = isMobile ? result.RefreshToken : null,
            expiresIn = result.ExpiresIn
        }));
    }

    /// <summary>
    /// Đăng xuất khỏi thiết bị hiện tại
    /// </summary>
    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var authHeader = Request.Headers["Authorization"].ToString();
        var token = authHeader.Replace("Bearer ", "");

        if (!string.IsNullOrEmpty(token))
        {
            await _identityProvider.LogoutAsync(token);
        }

        Response.Cookies.Delete("refreshToken");
        return Ok(ApiResponse<object>.Ok(true));
    }

    /// <summary>
    /// Gửi email quên mật khẩu
    /// </summary>
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        await _identityProvider.SendPasswordResetEmailAsync(request.Email);
        return Ok(ApiResponse<object>.Ok(true, new { message = "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi." }));
    }

    /// <summary>
    /// Đặt lại mật khẩu mới bằng token
    /// </summary>
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        await _identityProvider.ResetPasswordAsync(request.Token, request.NewPassword);
        return Ok(ApiResponse<object>.Ok(true, new { message = "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại." }));
    }

    /// <summary>
    /// Gửi mã xác thực OTP qua email
    /// </summary>
    [HttpPost("send-otp")]
    public async Task<IActionResult> SendOtp([FromBody] SendOtpRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(ApiResponse<object>.Fail("Vui lòng cung cấp email hợp lệ."));

        var cleanEmail = request.Email.Trim().ToLowerInvariant();
        var otp = System.Security.Cryptography.RandomNumberGenerator.GetInt32(100000, 1000000).ToString();

        var emailSent = await _emailService.SendEmailAsync(
            cleanEmail,
            "SmartLibrary - Mã xác thực Email đăng ký tài khoản",
            $"Mã xác thực OTP của bạn là: {otp}. Mã có hiệu lực trong vòng 10 phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai."
        );

        _memoryCache.Set($"reg_otp:{cleanEmail}", otp, TimeSpan.FromMinutes(10));
        _memoryCache.Remove($"reg_verified:{cleanEmail}");

        return Ok(ApiResponse<object>.Ok(new
        {
            message = emailSent
                ? "Mã xác thực đã được gửi đến email của bạn."
                : "Hệ thống chưa cấu hình SMTP để gửi mail thật. Vui lòng dùng mã OTP hiển thị trên màn hình để tiếp tục.",
            email = cleanEmail,
            otp
        }));
    }

    /// <summary>
    /// Xác thực mã OTP
    /// </summary>
    [HttpPost("verify-otp")]
    public IActionResult VerifyOtp([FromBody] VerifyOtpRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Otp))
            return BadRequest(ApiResponse<object>.Fail("Vui lòng cung cấp email và mã OTP."));

        var cleanEmail = request.Email.Trim().ToLowerInvariant();
        if (!_memoryCache.TryGetValue($"reg_otp:{cleanEmail}", out string? cachedOtp) || cachedOtp != request.Otp.Trim())
        {
            return BadRequest(ApiResponse<object>.Fail("Mã xác thực OTP không chính xác hoặc đã hết hạn."));
        }

        _memoryCache.Set($"reg_verified:{cleanEmail}", true, TimeSpan.FromMinutes(30));
        return Ok(ApiResponse<object>.Ok(new { verified = true, message = "Xác minh email thành công!" }));
    }

    public class RegisterReaderForm : SmartLibrary.Application.Interfaces.RegisterExternalReaderRequest
    {
        public IFormFile? Front { get; set; }
        public IFormFile? Back { get; set; }
        public IFormFile? Selfie { get; set; }
        public string? Otp { get; set; }
    }

    /// <summary>
    /// Đăng ký tài khoản độc giả ngoài kèm tài liệu xác thực
    /// </summary>
    [HttpPost("register-reader")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> RegisterReader([FromForm] RegisterReaderForm form)
    {
        var request = (SmartLibrary.Application.Interfaces.RegisterExternalReaderRequest)form;
        var front = form.Front;
        var back = form.Back;
        var selfie = form.Selfie;
        var otp = form.Otp;

        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(ApiResponse<object>.Fail("Vui lòng nhập địa chỉ email."));

        if (string.IsNullOrEmpty(request.Password))
            return BadRequest(ApiResponse<object>.Fail("Vui lòng nhập mật khẩu."));

        if (string.IsNullOrWhiteSpace(request.FullName))
            return BadRequest(ApiResponse<object>.Fail("Vui lòng nhập họ và tên."));

        if (front == null || front.Length == 0)
            return BadRequest(ApiResponse<object>.Fail("Vui lòng tải lên ảnh mặt trước giấy tờ."));

        var cleanEmail = request.Email.Trim().ToLowerInvariant();
        var isVerified = _memoryCache.TryGetValue($"reg_verified:{cleanEmail}", out bool v) && v;
        if (!isVerified && !string.IsNullOrWhiteSpace(otp))
        {
            if (_memoryCache.TryGetValue($"reg_otp:{cleanEmail}", out string? cached) && cached == otp.Trim())
            {
                isVerified = true;
            }
        }

        if (!isVerified)
        {
            return BadRequest(ApiResponse<object>.Fail("Email chưa được xác thực bằng mã OTP. Vui lòng quay lại bước xác minh email."));
        }

        try
        {
            var reqId = await _registrationService.RegisterExternalReaderAsync(request, front, back, selfie);
            _memoryCache.Remove($"reg_otp:{cleanEmail}");
            _memoryCache.Remove($"reg_verified:{cleanEmail}");

            return Ok(ApiResponse<object>.Ok(
                new { registrationId = reqId },
                new { message = "Đăng ký tài khoản và nộp hồ sơ thành công! Vui lòng chờ Thủ thư phê duyệt." }
            ));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error registering external reader: {Message}", ex.Message);
            return StatusCode(500, ApiResponse<object>.Fail(ex.Message));
        }
    }

    public record RefreshRequest(string? RefreshToken);
    public record ForgotPasswordRequest(string Email);
    public record ResetPasswordRequest(string Token, string NewPassword);
    public record SendOtpRequest(string Email, string? FullName);
    public record VerifyOtpRequest(string Email, string Otp);
}
