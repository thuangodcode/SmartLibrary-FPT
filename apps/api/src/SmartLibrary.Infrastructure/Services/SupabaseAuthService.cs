using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
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
    private readonly IMemoryCache _cache;
    private readonly string _supabaseUrl;
    private readonly string _anonKey;
    private readonly string _serviceRoleKey;
    private readonly string _connectionString;

    public SupabaseAuthService(
        HttpClient httpClient,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<SupabaseAuthService> logger,
        IMemoryCache cache)
    {
        _httpClient = httpClient;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
        _cache = cache;
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
                var errorMsg = "ÄÄƒng kÃ½ khÃ´ng thÃ nh cÃ´ng.";
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
            _logger.LogError(ex, "KhÃ´ng thá»ƒ káº¿t ná»‘i dá»‹ch vá»¥ Supabase Auth: {Message}", ex.Message);
            throw new ValidationException("KhÃ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n mÃ¡y chá»§ xÃ¡c thá»±c Supabase. Vui lÃ²ng kiá»ƒm tra láº¡i káº¿t ná»‘i máº¡ng.");
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
                ErrorMessage = "Dá»‹ch vá»¥ Ä‘Äƒng nháº­p chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh Ä‘áº§y Ä‘á»§. Vui lÃ²ng liÃªn há»‡ quáº£n trá»‹ viÃªn."
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
                    ErrorMessage = "Dá»‹ch vá»¥ xÃ¡c thá»±c Ä‘ang táº¡m thá»i khÃ´ng kháº£ dá»¥ng. Vui lÃ²ng thá»­ láº¡i."
                };
            }
            if ((int)response.StatusCode == 429)
            {
                _logger.LogWarning("Supabase Auth rate-limited a sign-in request.");
                return new AuthResult
                {
                    IsSuccess = false,
                    ErrorCode = "AUTH_RATE_LIMITED",
                    ErrorMessage = "Báº¡n Ä‘Ã£ thá»­ Ä‘Äƒng nháº­p quÃ¡ nhiá»u láº§n. Vui lÃ²ng chá» rá»“i thá»­ láº¡i."
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
                ErrorMessage = "KhÃ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n dá»‹ch vá»¥ xÃ¡c thá»±c Supabase."
            };
        }
        catch (TaskCanceledException ex)
        {
            _logger.LogError(ex, "Supabase Auth request timed out while signing in.");
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_SERVICE_UNAVAILABLE",
                ErrorMessage = "Dá»‹ch vá»¥ xÃ¡c thá»±c pháº£n há»“i quÃ¡ thá»i gian chá». Vui lÃ²ng thá»­ láº¡i."
            };
        }
        catch (NpgsqlException ex)
        {
            _logger.LogError(ex, "Could not check the application profile while signing in.");
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_PROFILE_SERVICE_UNAVAILABLE",
                ErrorMessage = "KhÃ´ng thá»ƒ kiá»ƒm tra há»“ sÆ¡ tÃ i khoáº£n lÃºc nÃ y. Vui lÃ²ng thá»­ láº¡i."
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
            SELECT p.status::text, p.is_active, p.is_deleted, r.name, p.email
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
                ErrorMessage = "TÃ i khoáº£n xÃ¡c thá»±c Ä‘Ã£ tá»“n táº¡i nhÆ°ng chÆ°a cÃ³ há»“ sÆ¡ thÆ° viá»‡n. Vui lÃ²ng liÃªn há»‡ quáº£n trá»‹ viÃªn."
            };
        }

        var status = reader.IsDBNull(0) ? null : reader.GetString(0);
        var isActive = !reader.IsDBNull(1) && reader.GetBoolean(1);
        var isDeleted = !reader.IsDBNull(2) && reader.GetBoolean(2);
        var role = reader.IsDBNull(3) ? null : reader.GetString(3);
        var email = reader.IsDBNull(4) ? null : reader.GetString(4);

        if (!isActive || isDeleted || string.Equals(status, "Suspended", StringComparison.OrdinalIgnoreCase))
        {
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_ACCOUNT_SUSPENDED",
                ErrorMessage = "TÃ i khoáº£n Ä‘Ã£ bá»‹ táº¡m ngÆ°ng hoáº·c vÃ´ hiá»‡u hÃ³a. Vui lÃ²ng liÃªn há»‡ quáº£n trá»‹ viÃªn."
            };
        }

        if (!string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(status, "PendingDocuments", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(status, "PendingApproval", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(status, "PendingVerification", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(status, "PendingActivation", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(status, "Rejected", StringComparison.OrdinalIgnoreCase))
        {
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_ACCOUNT_NOT_ACTIVE",
                ErrorMessage = "TÃ i khoáº£n chÆ°a Ä‘Æ°á»£c kÃ­ch hoáº¡t. Vui lÃ²ng xÃ¡c minh thÃ´ng tin hoáº·c liÃªn há»‡ quáº£n trá»‹ viÃªn."
            };
        }

        if (string.IsNullOrWhiteSpace(role))
        {
            return new AuthResult
            {
                IsSuccess = false,
                ErrorCode = "AUTH_ROLE_MISSING",
                ErrorMessage = "TÃ i khoáº£n chÆ°a Ä‘Æ°á»£c cáº¥p vai trÃ² truy cáº­p. Vui lÃ²ng liÃªn há»‡ quáº£n trá»‹ viÃªn."
            };
        }

        return null;
    }

    private static AuthResult InvalidCredentials() => new()
    {
        IsSuccess = false,
        ErrorCode = "AUTH_INVALID_CREDENTIALS",
        ErrorMessage = "Email, tÃªn Ä‘Äƒng nháº­p hoáº·c máº­t kháº©u khÃ´ng Ä‘Ãºng."
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
              AND p.status::text IN ('Active', 'PendingDocuments', 'PendingApproval', 'PendingVerification', 'PendingActivation', 'Rejected')
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
            return new AuthResult { IsSuccess = false, ErrorCode = "AUTH_TOKEN_EXPIRED", ErrorMessage = "PhiÃªn lÃ m viá»‡c Ä‘Ã£ háº¿t háº¡n. Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i." };
        var tokenRes = await response.Content.ReadFromJsonAsync<SupabaseTokenResponse>();
        if (tokenRes?.User?.Id is not { Length: > 0 } userId ||
            await GetActiveUserRoleAsync(userId) is null)
            return new AuthResult { IsSuccess = false, ErrorCode = "AUTH_TOKEN_EXPIRED", ErrorMessage = "TÃ i khoáº£n khÃ´ng cÃ²n hoáº¡t Ä‘á»™ng. Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i." };

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

        var cacheKey = "auth-role:" + userId;
        // Authorization state must reflect current approval status; do not cache an
        // earlier active role after a profile is moved back into review.

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(@"
            SELECT r.name
            FROM profiles p
            JOIN roles r ON r.id = p.role_id
            WHERE p.id = @uid
              AND p.is_active = true
              AND p.is_deleted = false
              AND p.status::text IN ('Active', 'PendingDocuments', 'PendingApproval', 'PendingVerification', 'PendingActivation', 'Rejected')
            LIMIT 1;", conn);
        cmd.Parameters.AddWithValue("uid", uid);
        var role = await cmd.ExecuteScalarAsync() as string;
        return role;
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
            throw new InvalidOperationException("Supabase Admin API chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh.");

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
            throw new ValidationException("Email nÃ y Ä‘Ã£ Ä‘Æ°á»£c tÃ i khoáº£n khÃ¡c sá»­ dá»¥ng.");

        _logger.LogError("Supabase email update failed with HTTP {StatusCode}.", (int)response.StatusCode);
        throw new InvalidOperationException("KhÃ´ng thá»ƒ cáº­p nháº­t email trÃªn dá»‹ch vá»¥ xÃ¡c thá»±c.");
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
            throw new ValidationException("KhÃ´ng thá»ƒ gá»­i email Ä‘áº·t láº¡i máº­t kháº©u.");
    }

    public async Task ResetPasswordAsync(string token, string newPassword)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, "user");
        request.Headers.Add("Authorization", $"Bearer {token}");
        request.Content = JsonContent.Create(new { password = newPassword });
        var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
            throw new ValidationException("Äáº·t láº¡i máº­t kháº©u tháº¥t báº¡i. MÃ£ xÃ¡c nháº­n cÃ³ thá»ƒ Ä‘Ã£ háº¿t háº¡n.");
    }

    public async Task ChangePasswordAsync(string userId, string email, string currentPassword, string newPassword)
    {
        if (string.IsNullOrWhiteSpace(_anonKey))
            throw new ValidationException("Dịch vụ đổi mật khẩu chưa được cấu hình.");

        using var loginRequest = new HttpRequestMessage(HttpMethod.Post, "token?grant_type=password")
        {
            Content = JsonContent.Create(new { email, password = currentPassword }),
        };
        loginRequest.Headers.TryAddWithoutValidation("apikey", _anonKey);
        using var loginResponse = await _httpClient.SendAsync(loginRequest);
        if (!loginResponse.IsSuccessStatusCode)
            throw new ValidationException("Mật khẩu hiện tại không chính xác.");

        var session = await loginResponse.Content.ReadFromJsonAsync<SupabaseTokenResponse>();
        if (session?.User?.Id != userId || string.IsNullOrWhiteSpace(session.AccessToken))
            throw new ValidationException("Không thể xác nhận tài khoản để đổi mật khẩu.");

        using var request = new HttpRequestMessage(HttpMethod.Put, "user")
        {
            Content = JsonContent.Create(new { password = newPassword }),
        };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", session.AccessToken);
        request.Headers.TryAddWithoutValidation("apikey", _anonKey);
        using var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync();
            _logger.LogWarning("Supabase password update failed with HTTP {StatusCode}: {ErrorBody}", (int)response.StatusCode, errorBody);
            throw new ValidationException("Đổi mật khẩu thất bại. Vui lòng kiểm tra cấu hình xác thực Supabase và thử lại.");
        }
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

            string? email = null, fullName = null, avatarUrl = null, roleName = null, status = null,
                phone = null, studentId = null, teacherId = null, employeeId = null, address = null;
            DateOnly? dateOfBirth = null;
            await using (var cmd = new NpgsqlCommand(@"
                SELECT p.email, p.full_name, p.avatar_url, r.name AS role_name, p.status::text,
                       p.phone, p.student_id, p.teacher_id, p.employee_id, p.address, p.date_of_birth
                FROM profiles p
                JOIN roles r ON p.role_id = r.id
                WHERE p.id = @uid
                  AND p.is_active = true
                  AND p.is_deleted = false
                  AND p.status::text IN ('Active', 'PendingDocuments', 'PendingApproval', 'PendingVerification', 'PendingActivation', 'Rejected')", conn))
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
                    phone = reader.IsDBNull(5) ? null : reader.GetString(5);
                    studentId = reader.IsDBNull(6) ? null : reader.GetString(6);
                    teacherId = reader.IsDBNull(7) ? null : reader.GetString(7);
                    employeeId = reader.IsDBNull(8) ? null : reader.GetString(8);
                    address = reader.IsDBNull(9) ? null : reader.GetString(9);
                    dateOfBirth = reader.IsDBNull(10) ? null : DateOnly.FromDateTime(reader.GetDateTime(10));
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
                phone, studentId, teacherId, employeeId, address, dateOfBirth,
                isVerified = HasApprovedRegistration(uid)
                    || (string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase)
                        && (!string.IsNullOrWhiteSpace(studentId)
                            || !string.IsNullOrWhiteSpace(teacherId)
                            || !string.IsNullOrWhiteSpace(employeeId)))
                    || HasApprovedLoanHistory(uid)
                    || (!string.IsNullOrWhiteSpace(phone) && !string.IsNullOrWhiteSpace(address)
                        && dateOfBirth.HasValue && (studentId is not null || teacherId is not null || employeeId is not null)
                        && HasIdentityDocuments(uid)),
                permissions
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching user profile for {UserId}", userId);
            return null;
        }
    }

    private bool HasIdentityDocuments(Guid userId)
    {
        using var conn = new NpgsqlConnection(_connectionString);
        conn.Open();
        using var cmd = new NpgsqlCommand(@"SELECT COUNT(DISTINCT d.side::text) = 3
            FROM registration_requests r JOIN identity_documents d ON d.request_id = r.id
            WHERE r.user_id = @uid AND d.deleted_at IS NULL AND r.status = 'Approved'", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        return cmd.ExecuteScalar() is true;
    }

    private bool HasApprovedRegistration(Guid userId)
    {
        using var conn = new NpgsqlConnection(_connectionString);
        conn.Open();
        using var cmd = new NpgsqlCommand(
            "SELECT EXISTS (SELECT 1 FROM registration_requests WHERE user_id = @uid AND status::text = 'Approved')", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        return cmd.ExecuteScalar() is true;
    }

    private bool HasApprovedLoanHistory(Guid userId)
    {
        using var conn = new NpgsqlConnection(_connectionString);
        conn.Open();
        using var cmd = new NpgsqlCommand(@"
            SELECT EXISTS (
                SELECT 1
                FROM borrow_records
                WHERE reader_id = @uid
                  AND is_deleted = false
                  AND status IN ('approved', 'borrowed', 'returned', 'overdue'))", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        return cmd.ExecuteScalar() is true;
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
