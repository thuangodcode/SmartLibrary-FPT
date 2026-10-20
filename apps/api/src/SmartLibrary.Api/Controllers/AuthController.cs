using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Auth.Commands;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IIdentityProvider _identityProvider;
    private readonly IAuthOtpService _authOtpService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IIdentityProvider identityProvider,
        IAuthOtpService authOtpService,
        ILogger<AuthController> logger)
    {
        _identityProvider = identityProvider;
        _authOtpService = authOtpService;
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
                return StatusCode(StatusCodes.Status503ServiceUnavailable, AuthFailure(result));
            if (result.ErrorCode == "AUTH_PROFILE_SERVICE_UNAVAILABLE")
                return StatusCode(StatusCodes.Status503ServiceUnavailable, AuthFailure(result));
            if (result.ErrorCode == "AUTH_RATE_LIMITED")
                return StatusCode(StatusCodes.Status429TooManyRequests, AuthFailure(result));
            if (result.ErrorCode is "AUTH_PROFILE_MISSING" or "AUTH_ACCOUNT_NOT_ACTIVE" or "AUTH_ACCOUNT_SUSPENDED" or "AUTH_ROLE_MISSING")
                return StatusCode(StatusCodes.Status403Forbidden, AuthFailure(result));

            return Unauthorized(AuthFailure(result));
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

        object? userProfile = null;
        if (!string.IsNullOrEmpty(result.UserId))
        {
            userProfile = await _identityProvider.GetUserProfileWithPermissionsAsync(result.UserId);
        }
        if (userProfile is null)
        {
            _logger.LogError("Authentication succeeded for user {UserId}, but the application profile could not be loaded.", result.UserId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ApiResponse<object>
            {
                Success = false,
                Error = "Đã xác thực được tài khoản nhưng tạm thời không đọc được hồ sơ thư viện. Vui lòng thử lại.",
                Meta = new { code = "AUTH_PROFILE_SERVICE_UNAVAILABLE" }
            });
        }

        var responseData = new
        {
            accessToken = result.AccessToken,
            refreshToken = isMobile ? result.RefreshToken : null,
            expiresIn = result.ExpiresIn,
            user = userProfile
        };

        return Ok(ApiResponse<object>.Ok(responseData));
    }

    private static ApiResponse<object> AuthFailure(AuthResult result) =>
        new()
        {
            Success = false,
            Error = result.ErrorMessage ?? "Đăng nhập thất bại.",
            Meta = new { code = result.ErrorCode }
        };

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
    public async Task<IActionResult> SendOtp([FromBody] SendOtpRequest request, CancellationToken ct)
    {
        var result = await _authOtpService.SendOtpAsync(request.Email, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<object>.Ok(new
        {
            message = result.Data!.Message,
            email = result.Data.Email,
            otp = result.Data.Otp
        }));
    }

    /// <summary>
    /// Xác thực mã OTP
    /// </summary>
    [HttpPost("verify-otp")]
    public IActionResult VerifyOtp([FromBody] VerifyOtpRequest request)
    {
        var result = _authOtpService.VerifyOtp(request.Email, request.Otp);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<object>.Ok(new { verified = result.Data!.Verified, message = result.Data.Message }));
    }

    public class RegisterReaderForm : RegisterExternalReaderRequest
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
    public async Task<IActionResult> RegisterReader([FromForm] RegisterReaderForm form, CancellationToken ct)
    {
        try
        {
            var result = await _authOtpService.RegisterExternalReaderAsync(
                form, form.Front, form.Back, form.Selfie, form.Otp, ct);

            if (!result.IsSuccess)
                return BadRequest(ApiResponse<object>.Fail(result.Error!));

            return Ok(ApiResponse<object>.Ok(
                new { registrationId = result.Data!.RegistrationId },
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
