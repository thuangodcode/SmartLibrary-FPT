using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Npgsql;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Exceptions;

namespace SmartLibrary.Infrastructure.Services;

public class SupabaseAuthService : IIdentityProvider
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SupabaseAuthService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _supabaseUrl;
    private readonly string _anonKey;
    private readonly string _serviceRoleKey;
    private readonly string _connectionString;

    public SupabaseAuthService(
        HttpClient httpClient,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<SupabaseAuthService> logger)
    {
        _httpClient = httpClient;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
        _supabaseUrl = configuration["Supabase:Url"] ?? "https://placeholder.supabase.co";
        _anonKey = configuration["Supabase:AnonKey"] ?? string.Empty;
        _serviceRoleKey = configuration["Supabase:ServiceRoleKey"] ?? string.Empty;
        _connectionString = configuration.GetConnectionString("DefaultConnection") ?? "";

        _httpClient.BaseAddress = new Uri($"{_supabaseUrl.TrimEnd('/')}/auth/v1/");
        if (!string.IsNullOrWhiteSpace(_anonKey))
            _httpClient.DefaultRequestHeaders.Add("apikey", _anonKey);
    }

    public async Task<(string UserId, bool EmailConfirmed)> RegisterUserAsync(string email, string password, string fullName, string? studentId)
    {
        var payload = new { email, password, data = new { full_name = fullName, student_id = studentId } };
        try
        {
            var response = await _httpClient.PostAsJsonAsync("signup", payload);
            if (!response.IsSuccessStatusCode)
            {
                var errorJson = await response.Content.ReadAsStringAsync();
                _logger.LogError("Supabase signup failed: {Error}", errorJson);
                var errorMsg = "Đăng ký không thành công.";
                if (errorJson.Contains("msg"))
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(errorJson);
                    if (doc.RootElement.TryGetProperty("msg", out var msgProp))
                        errorMsg = msgProp.GetString() ?? errorMsg;
                    else if (doc.RootElement.TryGetProperty("error_description", out var errDescProp))
                        errorMsg = errDescProp.GetString() ?? errorMsg;
                }
                throw new ValidationException($"Supabase Auth: {errorMsg}");
            }
            var res = await response.Content.ReadFromJsonAsync<SupabaseUserResponse>();
            return (res?.Id ?? Guid.NewGuid().ToString(), res?.EmailConfirmedAt != null);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Không thể kết nối dịch vụ Supabase Auth: {Message}", ex.Message);
            throw new ValidationException("Không thể kết nối đến máy chủ xác thực Supabase. Vui lòng kiểm tra lại kết nối mạng.");
        }
    }

    public async Task<AuthResult> LoginWithEmailPasswordAsync(string email, string password)
    {
        if (string.IsNullOrWhiteSpace(_anonKey) || string.IsNullOrWhiteSpace(_connectionString))
        {
            _logger.LogError("Login is unavailable because Supabase or database credentials are not configured.");
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_SERVICE_UNAVAILABLE",
                ErrorMessage = "Dịch vụ đăng nhập chưa được cấu hình đầy đủ. Vui lòng liên hệ quản trị viên."
            };
        }

        try
        {
            var cleanEmail = await ResolveLoginEmailAsync(email);
            if (cleanEmail is null)
                return InvalidCredentials();

            var payload = new { email = cleanEmail, password };
            var response = await _httpClient.PostAsJsonAsync("token?grant_type=password", payload);
            if (response.IsSuccessStatusCode)
            {
                var tokenRes = await response.Content.ReadFromJsonAsync<SupabaseTokenResponse>();
                if (tokenRes?.User?.Id is not { Length: > 0 } userId)
                    return InvalidCredentials();

                var accountResult = await CheckLoginEligibilityAsync(userId);
                if (accountResult is not null)
                    return accountResult;

                return new AuthResult
                {
                    IsSuccess = true,
                    AccessToken = tokenRes.AccessToken,
                    RefreshToken = tokenRes?.RefreshToken,
                    ExpiresIn = tokenRes?.ExpiresIn ?? 3600,
                    UserId = userId
                };
            }
            if ((int)response.StatusCode >= 500)
            {
                _logger.LogError("Supabase Auth returned HTTP {StatusCode} during sign-in.", (int)response.StatusCode);
                return new AuthResult
                {
                    IsSuccess = false,
                    ErrorCode = "AUTH_SERVICE_UNAVAILABLE",
                    ErrorMessage = "Dịch vụ xác thực đang tạm thời không khả dụng. Vui lòng thử lại."
                };
            }
            if ((int)response.StatusCode == 429)
            {
                _logger.LogWarning("Supabase Auth rate-limited a sign-in request.");
                return new AuthResult
                {
                    IsSuccess = false,
                    ErrorCode = "AUTH_RATE_LIMITED",
                    ErrorMessage = "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ rồi thử lại."
                };
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Could not reach Supabase Auth while signing in.");
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_SERVICE_UNAVAILABLE",
                ErrorMessage = "Không thể kết nối đến dịch vụ xác thực Supabase."
            };
        }
        catch (TaskCanceledException ex)
        {
            _logger.LogError(ex, "Supabase Auth request timed out while signing in.");
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_SERVICE_UNAVAILABLE",
                ErrorMessage = "Dịch vụ xác thực phản hồi quá thời gian chờ. Vui lòng thử lại."
            };
        }
        catch (NpgsqlException ex)
        {
            _logger.LogError(ex, "Could not check the application profile while signing in.");
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_PROFILE_SERVICE_UNAVAILABLE",
                ErrorMessage = "Không thể kiểm tra hồ sơ tài khoản lúc này. Vui lòng thử lại."
            };
        }

        return InvalidCredentials();
    }

    private async Task<AuthResult?> CheckLoginEligibilityAsync(string userId)
    {
        if (!Guid.TryParse(userId, out var uid))
            return InvalidCredentials();

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(@"
            SELECT p.status::text, p.is_active, p.is_deleted, r.name
            FROM profiles p
            LEFT JOIN roles r ON r.id = p.role_id
            WHERE p.id = @uid
            LIMIT 1;", conn);
        cmd.Parameters.AddWithValue("uid", uid);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_PROFILE_MISSING",
                ErrorMessage = "Tài khoản xác thực đã tồn tại nhưng chưa có hồ sơ thư viện. Vui lòng liên hệ quản trị viên."
            };
        }

        var status = reader.IsDBNull(0) ? null : reader.GetString(0);
        var isActive = !reader.IsDBNull(1) && reader.GetBoolean(1);
        var isDeleted = !reader.IsDBNull(2) && reader.GetBoolean(2);
        var role = reader.IsDBNull(3) ? null : reader.GetString(3);

        if (!isActive || isDeleted || string.Equals(status, "Suspended", StringComparison.OrdinalIgnoreCase))
        {
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_ACCOUNT_SUSPENDED",
                ErrorMessage = "Tài khoản đã bị tạm ngưng hoặc vô hiệu hóa. Vui lòng liên hệ quản trị viên."
            };
        }

        if (!string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase))
        {
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_ACCOUNT_NOT_ACTIVE",
                ErrorMessage = "Tài khoản chưa được kích hoạt. Vui lòng xác minh thông tin hoặc liên hệ quản trị viên."
            };
        }

        if (string.IsNullOrWhiteSpace(role))
        {
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_ROLE_MISSING",
                ErrorMessage = "Tài khoản chưa được cấp vai trò truy cập. Vui lòng liên hệ quản trị viên."
            };
        }

        return null;
    }

    private static AuthResult InvalidCredentials() => new()
    {
        IsSuccess = false,
        ErrorCode = "AUTH_INVALID_CREDENTIALS",
        ErrorMessage = "Email, tên đăng nhập hoặc mật khẩu không đúng."
    };

    private async Task<string?> ResolveLoginEmailAsync(string identifier)
    {
        var value = identifier.Trim();
        if (value.Contains('@'))
            return value.ToLowerInvariant();

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(@"
            SELECT MIN(p.email)
            FROM profiles p
            WHERE p.is_active = true
              AND p.is_deleted = false
              AND p.status::text = 'Active'
              AND (
                  LOWER(SPLIT_PART(p.email, '@', 1)) = LOWER(@identifier)
                  OR LOWER(p.student_id) = LOWER(@identifier)
              )
            HAVING COUNT(DISTINCT p.email) = 1;", conn);
        cmd.Parameters.AddWithValue("identifier", value);
        return await cmd.ExecuteScalarAsync() as string;
    }

    public async Task<AuthResult> RefreshTokenAsync(string refreshToken)
    {
        var payload = new { refresh_token = refreshToken };
        var response = await _httpClient.PostAsJsonAsync("token?grant_type=refresh_token", payload);
        if (!response.IsSuccessStatusCode)
            return new AuthResult { IsSuccess = false, ErrorCode = "AUTH_TOKEN_EXPIRED", ErrorMessage = "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại." };
        var tokenRes = await response.Content.ReadFromJsonAsync<SupabaseTokenResponse>();
        if (tokenRes?.User?.Id is not { Length: > 0 } userId ||
            await GetActiveUserRoleAsync(userId) is null)
            return new AuthResult { IsSuccess = false, ErrorCode = "AUTH_TOKEN_EXPIRED", ErrorMessage = "Tài khoản không còn hoạt động. Vui lòng đăng nhập lại." };

        return new AuthResult
        {
            IsSuccess = true,
            AccessToken = tokenRes?.AccessToken,
            RefreshToken = tokenRes?.RefreshToken,
            ExpiresIn = tokenRes?.ExpiresIn ?? 3600,
            UserId = userId
        };
    }

    public async Task<string?> GetAuthenticatedUserIdAsync(string accessToken, CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "user");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if ((int)response.StatusCode is >= 400 and < 500)
            return null;

        response.EnsureSuccessStatusCode();
        var user = await response.Content.ReadFromJsonAsync<SupabaseUserResponse>(cancellationToken);
        return Guid.TryParse(user?.Id, out _) ? user.Id : null;
    }

    public async Task<string?> GetActiveUserRoleAsync(string userId)
    {
        if (!Guid.TryParse(userId, out var uid))
            return null;

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(@"
            SELECT r.name
            FROM profiles p
            JOIN roles r ON r.id = p.role_id
            WHERE p.id = @uid
              AND p.is_active = true
              AND p.is_deleted = false
              AND p.status::text = 'Active'
            LIMIT 1;", conn);
        cmd.Parameters.AddWithValue("uid", uid);
        return await cmd.ExecuteScalarAsync() as string;
    }

    public async Task LogoutAsync(string accessToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "logout");
        request.Headers.Add("Authorization", $"Bearer {accessToken}");
        await _httpClient.SendAsync(request);
    }

    public async Task UpdateEmailAsync(string userId, string email, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_serviceRoleKey) || string.IsNullOrWhiteSpace(_supabaseUrl))
            throw new InvalidOperationException("Supabase Admin API chưa được cấu hình.");

        using var request = new HttpRequestMessage(
            HttpMethod.Put,
            $"{_supabaseUrl.TrimEnd('/')}/auth/v1/admin/users/{Uri.EscapeDataString(userId)}")
        {
            Content = JsonContent.Create(new { email, email_confirm = true })
        };
        request.Headers.Add("apikey", _serviceRoleKey);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _serviceRoleKey);

        using var client = _httpClientFactory.CreateClient();
        using var response = await client.SendAsync(request, cancellationToken);
        if (response.IsSuccessStatusCode)
            return;

        if (response.StatusCode is System.Net.HttpStatusCode.Conflict or System.Net.HttpStatusCode.UnprocessableEntity)
            throw new ValidationException("Email này đã được tài khoản khác sử dụng.");

        _logger.LogError("Supabase email update failed with HTTP {StatusCode}.", (int)response.StatusCode);
        throw new InvalidOperationException("Không thể cập nhật email trên dịch vụ xác thực.");
    }

    public async Task SendPasswordResetEmailAsync(string email)
    {
        var redirectTo = _configuration["Supabase:PasswordResetRedirectUrl"];
        if (string.IsNullOrWhiteSpace(redirectTo))
        {
            var allowedOrigins = _configuration["Cors:AllowedOrigins"]?
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var webOrigin = allowedOrigins?.FirstOrDefault() ?? "http://localhost:5173";
            redirectTo = $"{webOrigin.TrimEnd('/')}/reset-password";
        }

        using var response = await _httpClient.PostAsJsonAsync("recover", new { email, redirect_to = redirectTo });
        if (!response.IsSuccessStatusCode)
            throw new ValidationException("Không thể gửi email đặt lại mật khẩu.");
    }

    public async Task ResetPasswordAsync(string token, string newPassword)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, "user");
        request.Headers.Add("Authorization", $"Bearer {token}");
        request.Content = JsonContent.Create(new { password = newPassword });
        var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            throw new ValidationException("Đặt lại mật khẩu thất bại. Mã xác nhận có thể đã hết hạn.");
    }

    public async Task ChangePasswordAsync(string userId, string currentPassword, string newPassword)
    {
        var response = await _httpClient.PutAsJsonAsync("user", new { password = newPassword });
        if (!response.IsSuccessStatusCode)
            throw new ValidationException("Đổi mật khẩu thất bại.");
    }

    public async Task ResendVerificationEmailAsync(string email)
    {
        await _httpClient.PostAsJsonAsync("resend", new { type = "signup", email });
    }

    /// <summary>
    /// Query user profile, role, and permissions directly via raw SQL (snake_case DB schema).
    /// </summary>
    public async Task<object?> GetUserProfileWithPermissionsAsync(string userId)
    {
        if (!Guid.TryParse(userId, out var uid)) return null;

        try
        {
            await using var conn = new NpgsqlConnection(_connectionString);
            await conn.OpenAsync();

            string? email = null, fullName = null, avatarUrl = null, roleName = null, status = null;
            await using (var cmd = new NpgsqlCommand(@"
                SELECT p.email, p.full_name, p.avatar_url, r.name AS role_name, p.status::text
                FROM profiles p
                JOIN roles r ON p.role_id = r.id
                WHERE p.id = @uid
                  AND p.is_active = true
                  AND p.is_deleted = false
                  AND p.status::text = 'Active'", conn))
            {
                cmd.Parameters.AddWithValue("uid", uid);
                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    email = reader.IsDBNull(0) ? null : reader.GetString(0);
                    fullName = reader.IsDBNull(1) ? null : reader.GetString(1);
                    avatarUrl = reader.IsDBNull(2) ? null : reader.GetString(2);
                    roleName = reader.IsDBNull(3) ? null : reader.GetString(3);
                    status = reader.IsDBNull(4) ? null : reader.GetString(4);
                }
            }

            if (email is null)
                return null;

            // Get permissions for role
            var permissions = new List<string>();
            await using (var cmd2 = new NpgsqlCommand(@"
                SELECT pe.code
                FROM role_permissions rp
                JOIN permissions pe ON rp.permission_id = pe.id
                JOIN roles r ON rp.role_id = r.id
                JOIN profiles p ON p.role_id = r.id
                WHERE p.id = @uid", conn))
            {
                cmd2.Parameters.AddWithValue("uid", uid);
                await using var reader2 = await cmd2.ExecuteReaderAsync();
                while (await reader2.ReadAsync())
                {
                    permissions.Add(reader2.GetString(0));
                }
            }

            return new
            {
                id = uid,
                email,
                fullName,
                avatarUrl,
                role = roleName ?? "Reader",
                status = status ?? "PendingVerification",
                permissions
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user profile for {UserId}", userId);
            return null;
        }
    }

    private class SupabaseUserResponse
    {
        [JsonPropertyName("id")] public string Id { get; set; } = string.Empty;
        [JsonPropertyName("email")] public string? Email { get; set; }
        [JsonPropertyName("email_confirmed_at")] public string? EmailConfirmedAt { get; set; }
    }

    private class SupabaseTokenResponse
    {
        [JsonPropertyName("access_token")] public string AccessToken { get; set; } = string.Empty;
        [JsonPropertyName("refresh_token")] public string RefreshToken { get; set; } = string.Empty;
        [JsonPropertyName("expires_in")] public int ExpiresIn { get; set; }
        [JsonPropertyName("user")] public SupabaseUserResponse? User { get; set; }
    }
}
