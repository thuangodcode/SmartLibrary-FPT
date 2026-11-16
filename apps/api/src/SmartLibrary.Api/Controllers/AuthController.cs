using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Net.Http.Json;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Auth.Commands;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IIdentityProvider _identityProvider;
    private readonly IAuthOtpService _authOtpService;
    private readonly ILogger<AuthController> _logger;
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;

    public AuthController(
        IIdentityProvider identityProvider,
        IAuthOtpService authOtpService,
        ILogger<AuthController> logger,
        AppDbContext db,
        IConfiguration configuration)
    {
        _identityProvider = identityProvider;
        _authOtpService = authOtpService;
        _logger = logger;
        _db = db;
        _configuration = configuration;
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
                SameSite = SameSiteMode.None,
                Expires = DateTimeOffset.UtcNow.AddDays(7)
            };
            Response.Cookies.Append("refreshToken", result.RefreshToken, cookieOptions);
        }

        object? userProfile = null;
        if (!string.IsNullOrEmpty(result.UserId))
        {
            userProfile = await _identityProvider.GetUserProfileWithPermissionsAsync(result.UserId);
        }
        if (userProfile is not null && !string.IsNullOrEmpty(result.UserId))
            userProfile = await AddVerificationStateAsync(userProfile, result.UserId);
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

    [HttpPost("google/exchange")]
    public async Task<IActionResult> ExchangeGoogleToken([FromBody] GoogleExchangeRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.AccessToken) || string.IsNullOrWhiteSpace(request.Email))
            return Unauthorized(ApiResponse<object>.Fail("Phiên Google không hợp lệ."));
        var userId = await _identityProvider.GetAuthenticatedUserIdAsync(request.AccessToken, ct);
        if (!Guid.TryParse(userId, out var id)) return Unauthorized(ApiResponse<object>.Fail("Phiên Google không hợp lệ."));

        using var http = new HttpClient();
        var url = _configuration["Supabase:Url"];
        var key = _configuration["Supabase:AnonKey"];
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(key))
            return StatusCode(503, ApiResponse<object>.Fail("Đăng nhập Google chưa được cấu hình."));
        http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", request.AccessToken);
        http.DefaultRequestHeaders.Add("apikey", key);
        using var googleResponse = await http.GetAsync($"{url.TrimEnd('/')}/auth/v1/user", ct);
        if (!googleResponse.IsSuccessStatusCode) return Unauthorized(ApiResponse<object>.Fail("Phiên Google không hợp lệ."));
        var identity = await googleResponse.Content.ReadFromJsonAsync<GoogleIdentity>(cancellationToken: ct);
        if (identity?.Id != id.ToString() || !string.Equals(identity.Email, request.Email, StringComparison.OrdinalIgnoreCase))
            return Unauthorized(ApiResponse<object>.Fail("Thông tin email Google không khớp."));

        var profile = await _db.UserProfiles.Include(x => x.Role).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (profile is null)
        {
            var role = await _db.UserProfiles.Select(x => x.Role).Distinct().FirstOrDefaultAsync(x => x.Name == "Reader", ct);
            if (role is null) return StatusCode(503, ApiResponse<object>.Fail("Chưa cấu hình vai trò độc giả."));
            profile = new SmartLibrary.Domain.Entities.UserProfile
            {
                Id = id, Email = identity.Email.Trim().ToLowerInvariant(),
                FullName = string.IsNullOrWhiteSpace(request.FullName) ? identity.Email.Split('@')[0] : request.FullName.Trim(),
                AvatarUrl = request.AvatarUrl, RoleId = role.Id, Role = role,
                Status = SmartLibrary.Domain.Enums.AccountStatus.Active, IsActive = true
            };
            _db.UserProfiles.Add(profile);
            await _db.SaveChangesAsync(ct);
        }
        else if (!profile.IsActive || profile.IsDeleted || profile.Status == SmartLibrary.Domain.Enums.AccountStatus.Suspended)
            return StatusCode(403, ApiResponse<object>.Fail("Tài khoản đã bị tạm ngưng."));

        var permissions = await _db.UserProfiles.Where(x => x.Id == profile.Id)
            .SelectMany(x => x.Role.RolePermissions).Select(x => x.Permission.Code).ToListAsync(ct);
        var isVerified = await IsProfileVerifiedAsync(profile.Id, ct);
        return Ok(ApiResponse<object>.Ok(new { user = new {
            id = profile.Id, email = profile.Email, fullName = profile.FullName, avatarUrl = profile.AvatarUrl,
            role = profile.Role.Name, status = profile.Status.ToString(), permissions, isVerified,
            phone = profile.Phone, studentId = profile.StudentId, teacherId = profile.TeacherId,
            employeeId = profile.EmployeeId, address = profile.Address, dateOfBirth = profile.DateOfBirth
        }}));
    }

    private async Task<bool> IsProfileVerifiedAsync(Guid userId, CancellationToken ct)
    {
        if (await _db.RegistrationRequests.AsNoTracking().AnyAsync(
                r => r.UserId == userId && r.Status == SmartLibrary.Domain.Enums.RegistrationRequestStatus.Approved, ct))
            return true;

        var p = await _db.UserProfiles.AsNoTracking().FirstAsync(x => x.Id == userId, ct);
        if (string.IsNullOrWhiteSpace(p.Phone) || string.IsNullOrWhiteSpace(p.Address) || p.DateOfBirth is null
            || (p.StudentId is null && p.TeacherId is null && p.EmployeeId is null)) return false;
        return await _db.IdentityDocuments.IgnoreQueryFilters().Where(d => d.Request.UserId == userId && !d.IsDeleted && d.Request.Status == SmartLibrary.Domain.Enums.RegistrationRequestStatus.Approved)
            .Select(d => d.Side).Distinct().CountAsync(ct) == 3;
    }

    private async Task<object> AddVerificationStateAsync(object userProfile, string userId)
    {
        if (!Guid.TryParse(userId, out var id)) return userProfile;
        var json = System.Text.Json.JsonSerializer.SerializeToElement(userProfile);
        if (!json.TryGetProperty("email", out var emailElement) || !json.TryGetProperty("isVerified", out _)) return userProfile;
        var verified = await IsProfileVerifiedAsync(id, HttpContext.RequestAborted);
        return new { id, email = emailElement.GetString(), fullName = json.TryGetProperty("fullName", out var name) ? name.GetString() : null,
            avatarUrl = json.TryGetProperty("avatarUrl", out var avatar) ? avatar.GetString() : null,
            role = json.TryGetProperty("role", out var role) ? role.GetString() : null,
            status = json.TryGetProperty("status", out var status) ? status.GetString() : null,
            permissions = json.TryGetProperty("permissions", out var permissions) ? permissions : default,
            isVerified = verified,
            phone = json.TryGetProperty("phone", out var phone) ? phone.GetString() : null,
            address = json.TryGetProperty("address", out var address) ? address.GetString() : null,
            dateOfBirth = json.TryGetProperty("dateOfBirth", out var dob) ? dob.GetString() : null };
    }
    public sealed record GoogleExchangeRequest(string AccessToken, string Email, string? FullName, string? AvatarUrl);
    private sealed record GoogleIdentity(string Id, string Email);

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
        if (userProfile is not null) userProfile = await AddVerificationStateAsync(userProfile, userId);
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
                SameSite = SameSiteMode.None,
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
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request, CancellationToken ct)
    {
        var origin = Request.Headers["Origin"].ToString();
        if (string.IsNullOrWhiteSpace(origin))
            origin = Request.Headers["Referer"].ToString();

        var result = await _authOtpService.SendPasswordResetOtpAsync(request.Email, origin, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<object>.Ok(true, new { message = "Nếu email tồn tại trong hệ thống, hướng dẫn và mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn." }));
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userId, out var id))
            return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
        if (string.IsNullOrEmpty(request.CurrentPassword) || request.NewPassword is null)
            return BadRequest(ApiResponse<object>.Fail("Vui lòng nhập mật khẩu hiện tại và mật khẩu mới."));

        var email = await _db.UserProfiles.AsNoTracking().Where(profile => profile.Id == id)
            .Select(profile => profile.Email).FirstOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(email))
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy tài khoản."));

        try
        {
            await _identityProvider.ChangePasswordAsync(id.ToString(), email, request.CurrentPassword, request.NewPassword);
            return Ok(ApiResponse<object>.Ok(true, new { message = "Đổi mật khẩu thành công." }));
        }
        catch (SmartLibrary.Domain.Exceptions.ValidationException exception)
        {
            return BadRequest(ApiResponse<object>.Fail(exception.Message));
        }
    }

    /// <summary>
    /// Đặt lại mật khẩu mới bằng token hoặc mã OTP
    /// </summary>
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        var result = await _authOtpService.ResetPasswordWithOtpOrTokenAsync(
            request.Email, request.Token, request.Otp, request.NewPassword, ct);

        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<object>.Ok(true, new { message = "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới." }));
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
            email = result.Data.Email
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
    public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
    public record ResetPasswordRequest(string? Email, string? Token, string? Otp, string NewPassword);
    public record SendOtpRequest(string Email, string? FullName);
    public record VerifyOtpRequest(string Email, string Otp);
}
