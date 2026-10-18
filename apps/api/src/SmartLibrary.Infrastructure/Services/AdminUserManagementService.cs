using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using EmailAddressAttribute = System.ComponentModel.DataAnnotations.EmailAddressAttribute;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Domain.Exceptions;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Infrastructure.Services;

public sealed class AdminUserManagementService : IAdminUserManagementService
{
    private const int MaximumImportRows = 1000;
    private readonly AppDbContext _dbContext;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IIdentityProvider _identityProvider;
    private readonly ILogger<AdminUserManagementService> _logger;
    private readonly string _supabaseUrl;
    private readonly string _serviceRoleKey;

    public AdminUserManagementService(
        AppDbContext dbContext,
        IHttpClientFactory httpClientFactory,
        IIdentityProvider identityProvider,
        IConfiguration configuration,
        ILogger<AdminUserManagementService> logger)
    {
        _dbContext = dbContext;
        _httpClientFactory = httpClientFactory;
        _identityProvider = identityProvider;
        _logger = logger;
        _supabaseUrl = configuration["Supabase:Url"] ?? string.Empty;
        _serviceRoleKey = configuration["Supabase:ServiceRoleKey"] ?? string.Empty;
    }

    public async Task<object> GetUsersAsync(
        string? role,
        string? query,
        string? status,
        string? readerType,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var users = _dbContext.UserProfiles
            .IgnoreQueryFilters()
            .Include(user => user.Role)
            .Where(user => !user.IsDeleted && user.Role.Name != null);

        var normalizedRole = string.IsNullOrWhiteSpace(role) ? "Reader" : role.Trim();
        if (normalizedRole.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            users = users.Where(user => user.Role.Name == "Reader" || user.Role.Name == "Librarian");
        }
        else if (normalizedRole.Equals("Reader", StringComparison.OrdinalIgnoreCase) ||
                 normalizedRole.Equals("Librarian", StringComparison.OrdinalIgnoreCase))
        {
            users = users.Where(user => user.Role.Name == normalizedRole);
        }
        else
        {
            throw new ValidationException("Vai trò cần xem không hợp lệ.");
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var term = query.Trim().ToLowerInvariant();
            users = users.Where(user =>
                user.FullName.ToLower().Contains(term) ||
                user.Email.ToLower().Contains(term) ||
                (user.StudentId != null && user.StudentId.ToLower().Contains(term)) ||
                (user.Phone != null && user.Phone.Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(status) &&
            !status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (!Enum.TryParse<AccountStatus>(status, true, out var parsedStatus))
                throw new ValidationException("Trạng thái tài khoản không hợp lệ.");

            users = users.Where(user => user.Status == parsedStatus);
        }

        if (normalizedRole.Equals("Reader", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(readerType) &&
            !readerType.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (!Enum.TryParse<ReaderType>(readerType, true, out var parsedReaderType))
                throw new ValidationException("Loại độc giả không hợp lệ.");

            users = users.Where(user => user.ReaderType == parsedReaderType);
        }

        var totalCount = await users.CountAsync(cancellationToken);
        var items = await users
            .OrderByDescending(user => user.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(user => new
            {
                user.Id,
                user.FullName,
                user.Email,
                user.StudentId,
                user.Phone,
                user.ReaderType,
                Status = user.Status.ToString(),
                user.IsActive,
                user.CreatedAt,
                RoleName = user.Role.Name
            })
            .ToListAsync(cancellationToken);

        var readerStats = await _dbContext.UserProfiles
            .IgnoreQueryFilters()
            .Where(user => !user.IsDeleted && user.Role.Name == "Reader")
            .GroupBy(user => user.ReaderType)
            .Select(group => new { ReaderType = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        var librarianStats = await _dbContext.UserProfiles
            .IgnoreQueryFilters()
            .Where(user => !user.IsDeleted && user.Role.Name == "Librarian")
            .GroupBy(user => user.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        return new
        {
            items,
            totalCount,
            page,
            pageSize,
            totalPages = (int)Math.Ceiling(totalCount / (double)pageSize),
            stats = new
            {
                totalReaders = readerStats.Sum(item => item.Count),
                studentReaders = readerStats.Where(item => item.ReaderType == ReaderType.Student).Sum(item => item.Count),
                lecturerReaders = readerStats.Where(item => item.ReaderType == ReaderType.Lecturer).Sum(item => item.Count),
                externalReaders = readerStats.Where(item => item.ReaderType == ReaderType.External).Sum(item => item.Count),
                totalLibrarians = librarianStats.Sum(item => item.Count),
                activeLibrarians = librarianStats.Where(item => item.Status == AccountStatus.Active).Sum(item => item.Count)
            }
        };
    }

    public async Task<object> CreateLibrarianAsync(
        CreateLibrarianRequest request,
        Guid createdBy,
        CancellationToken cancellationToken)
    {
        var fullName = request.FullName?.Trim() ?? string.Empty;
        var username = request.Username?.Trim() ?? string.Empty;
        if (fullName.Length is < 2 or > 255)
            throw new ValidationException("Họ và tên phải có từ 2 đến 255 ký tự.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(username, "^[a-zA-Z0-9._-]{3,50}$"))
            throw new ValidationException("Tên tài khoản chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang (3-50 ký tự).");
        var password = request.Password ?? string.Empty;
        if (password.Length < 8)
            throw new ValidationException("Mật khẩu Thủ thư phải có ít nhất 8 ký tự.");

        var email = $"{username}@smartlibrary.local";
        var duplicate = await _dbContext.UserProfiles
            .IgnoreQueryFilters()
            .AnyAsync(user => user.Email.ToLower() == email.ToLower(), cancellationToken);
        if (duplicate)
            throw new ValidationException("Tên tài khoản này đã được sử dụng.");

        var role = await _dbContext.Set<Role>().SingleOrDefaultAsync(item => item.Name == "Librarian", cancellationToken)
            ?? throw new InvalidOperationException("Không tìm thấy role Librarian trong cơ sở dữ liệu.");

        var userId = await CreateAuthUserAsync(email, password, fullName, null, cancellationToken);
        try
        {
            var profile = await GetOrCreateProfileAsync(userId, email, fullName, role.Id, createdBy, cancellationToken);
            profile.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            profile.Status = AccountStatus.Active;
            profile.IsActive = true;
            profile.IsDeleted = false;
            profile.CreatedBy = createdBy;
            await _dbContext.SaveChangesAsync(cancellationToken);

            return new
            {
                profile.Id,
                profile.FullName,
                profile.Email,
                Username = username,
                RoleName = "Librarian",
                Status = profile.Status.ToString(),
                profile.CreatedAt
            };
        }
        catch (Exception exception) when (
            exception is DbUpdateException or InvalidOperationException or HttpRequestException or ValidationException)
        {
            await TryDeleteAuthUserAsync(userId, cancellationToken);
            throw;
        }
    }

    public async Task<object> ImportReadersAsync(
        string fileName,
        Stream csvStream,
        Guid createdBy,
        CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(csvStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
        var contents = await reader.ReadToEndAsync(cancellationToken);
        var rows = ParseCsv(contents);
        if (rows.Count < 2)
            throw new ValidationException("Tệp CSV cần có hàng tiêu đề và ít nhất một dòng dữ liệu.");
        if (rows.Count - 1 > MaximumImportRows)
            throw new ValidationException($"Mỗi lần chỉ được nhập tối đa {MaximumImportRows} người dùng.");

        var headerCells = rows[0]
            .Select((name, index) => (Name: name.Trim().TrimStart('\uFEFF'), Index: index))
            .ToList();
        if (headerCells.GroupBy(item => item.Name, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1))
            throw new ValidationException("Tệp CSV có tên cột bị trùng lặp.");
        var headers = headerCells.ToDictionary(item => item.Name, item => item.Index, StringComparer.OrdinalIgnoreCase);
        foreach (var required in new[] { "fullName", "email", "studentId" })
        {
            if (!headers.ContainsKey(required))
                throw new ValidationException($"Thiếu cột bắt buộc '{required}' trong tệp CSV.");
        }

        var readerRole = await _dbContext.Set<Role>().SingleOrDefaultAsync(item => item.Name == "Reader", cancellationToken)
            ?? throw new InvalidOperationException("Không tìm thấy role Reader trong cơ sở dữ liệu.");
        var createdByProfileExists = await _dbContext.UserProfiles
            .AnyAsync(profile => profile.Id == createdBy && profile.Role.Name == "Admin", cancellationToken);
        if (!createdByProfileExists)
            throw new InvalidOperationException("Không thể xác định tài khoản Admin thực hiện nhập dữ liệu.");

        var resultRows = new List<ImportRowResult>(rows.Count - 1);
        var createdCount = 0;
        var failedCount = 0;
        var notificationFailureCount = 0;

        for (var index = 1; index < rows.Count; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var lineNumber = index + 1;
            var values = rows[index];
            var fullName = GetCsvValue(values, headers, "fullName");
            var email = GetCsvValue(values, headers, "email");
            var studentId = GetCsvValue(values, headers, "studentId");
            var phone = GetCsvValue(values, headers, "phone");
            var address = GetCsvValue(values, headers, "address");
            var readerTypeText = GetCsvValue(values, headers, "readerType");
            var birthDateText = GetCsvValue(values, headers, "dateOfBirth");

            var validationError = ValidateImportRow(fullName, email, studentId, readerTypeText, birthDateText);
            if (validationError is not null)
            {
                failedCount++;
                resultRows.Add(new ImportRowResult(lineNumber, email, false, false, validationError));
                continue;
            }

            var normalizedEmail = email.Trim().ToLowerInvariant();
            if (await _dbContext.UserProfiles.IgnoreQueryFilters()
                    .AnyAsync(profile => profile.Email.ToLower() == normalizedEmail, cancellationToken))
            {
                failedCount++;
                resultRows.Add(new ImportRowResult(lineNumber, email, false, false, "Email đã tồn tại."));
                continue;
            }

            if (await _dbContext.UserProfiles.IgnoreQueryFilters()
                    .AnyAsync(profile => profile.StudentId == studentId.Trim(), cancellationToken))
            {
                failedCount++;
                resultRows.Add(new ImportRowResult(lineNumber, email, false, false, "Mã số đã tồn tại."));
                continue;
            }

            Guid? authUserId = null;
            try
            {
                var randomPassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)) + "aA1!";
                authUserId = await CreateAuthUserAsync(normalizedEmail, randomPassword, fullName.Trim(), studentId.Trim(), cancellationToken);

                var profile = await GetOrCreateProfileAsync(
                    authUserId.Value,
                    normalizedEmail,
                    fullName.Trim(),
                    readerRole.Id,
                    createdBy,
                    cancellationToken);
                profile.StudentId = studentId.Trim();
                profile.Phone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();
                profile.Address = string.IsNullOrWhiteSpace(address) ? null : address.Trim();
                profile.ReaderType = ParseReaderType(readerTypeText);
                profile.DateOfBirth = ParseDateOnly(birthDateText);
                profile.Status = AccountStatus.Active;
                profile.IsActive = true;
                profile.IsDeleted = false;
                profile.CreatedBy = createdBy;
                await _dbContext.SaveChangesAsync(cancellationToken);
                createdCount++;

                try
                {
                    await _identityProvider.SendPasswordResetEmailAsync(normalizedEmail);
                    resultRows.Add(new ImportRowResult(lineNumber, normalizedEmail, true, true, null));
                }
                catch (Exception exception) when (exception is HttpRequestException or ValidationException)
                {
                    notificationFailureCount++;
                    _logger.LogWarning(exception, "Imported Reader {Email} but password setup email failed.", normalizedEmail);
                    resultRows.Add(new ImportRowResult(
                        lineNumber,
                        normalizedEmail,
                        true,
                        false,
                        "Tài khoản đã tạo nhưng chưa gửi được email đặt mật khẩu."));
                }
            }
            catch (Exception exception) when (
                exception is HttpRequestException or DbUpdateException or InvalidOperationException or ValidationException)
            {
                if (authUserId.HasValue)
                    await TryDeleteAuthUserAsync(authUserId.Value, cancellationToken);
                _dbContext.ChangeTracker.Clear();
                failedCount++;
                _logger.LogWarning(exception, "Failed to import Reader from CSV row {RowNumber}.", lineNumber);
                resultRows.Add(new ImportRowResult(lineNumber, email, false, false, "Không thể tạo tài khoản từ dòng dữ liệu này."));
            }
        }

        var batch = new UserImportBatch
        {
            CreatedById = createdBy,
            FileName = Path.GetFileName(fileName),
            TotalRows = rows.Count - 1,
            SuccessRows = createdCount,
            FailedRows = failedCount,
            Errors = JsonSerializer.Serialize(resultRows.Where(row => !row.Success || !row.PasswordSetupEmailSent))
        };
        _dbContext.UserImportBatches.Add(batch);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new
        {
            batch.Id,
            batch.TotalRows,
            batch.SuccessRows,
            batch.FailedRows,
            notificationFailureCount,
            results = resultRows
        };
    }

    private async Task<Guid> CreateAuthUserAsync(
        string email,
        string password,
        string fullName,
        string? studentId,
        CancellationToken cancellationToken)
    {
        EnsureAdminAuthConfigured();
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"{_supabaseUrl.TrimEnd('/')}/auth/v1/admin/users")
        {
            Content = JsonContent.Create(new
            {
                email,
                password,
                email_confirm = true,
                user_metadata = new { full_name = fullName, student_id = studentId }
            })
        };
        request.Headers.Add("apikey", _serviceRoleKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceRoleKey);
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var providerError = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning("Supabase Admin user creation failed with status {StatusCode}.", response.StatusCode);
            if (response.StatusCode == HttpStatusCode.Conflict || providerError.Contains("already", StringComparison.OrdinalIgnoreCase))
                throw new ValidationException("Email hoặc tên tài khoản đã được sử dụng.");

            throw new InvalidOperationException("Không thể tạo tài khoản trên dịch vụ xác thực.");
        }

        var createdUser = await response.Content.ReadFromJsonAsync<SupabaseAdminUser>(cancellationToken: cancellationToken);
        if (createdUser is null || !Guid.TryParse(createdUser.Id, out var userId))
            throw new InvalidOperationException("Dịch vụ xác thực trả về dữ liệu tài khoản không hợp lệ.");

        return userId;
    }

    private async Task<UserProfile> GetOrCreateProfileAsync(
        Guid userId,
        string email,
        string fullName,
        Guid roleId,
        Guid createdBy,
        CancellationToken cancellationToken)
    {
        var profile = await _dbContext.UserProfiles
            .IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.Id == userId, cancellationToken);
        if (profile is null)
        {
            profile = new UserProfile
            {
                Id = userId,
                Email = email,
                FullName = fullName,
                RoleId = roleId,
                CreatedBy = createdBy
            };
            _dbContext.UserProfiles.Add(profile);
        }
        else
        {
            profile.Email = email;
            profile.FullName = fullName;
            profile.RoleId = roleId;
            profile.CreatedBy = createdBy;
        }

        return profile;
    }

    private async Task TryDeleteAuthUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        try
        {
            EnsureAdminAuthConfigured();
            var client = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(
                HttpMethod.Delete,
                $"{_supabaseUrl.TrimEnd('/')}/auth/v1/admin/users/{userId}");
            request.Headers.Add("apikey", _serviceRoleKey);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _serviceRoleKey);
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                _logger.LogError("Supabase Auth cleanup failed for user {UserId} with status {StatusCode}.", userId, response.StatusCode);
        }
        catch (HttpRequestException exception)
        {
            _logger.LogError(exception, "Supabase Auth cleanup failed for user {UserId}.", userId);
        }
    }

    private void EnsureAdminAuthConfigured()
    {
        if (string.IsNullOrWhiteSpace(_supabaseUrl) || string.IsNullOrWhiteSpace(_serviceRoleKey))
            throw new InvalidOperationException("Supabase Admin API chưa được cấu hình.");
    }

    private static string? ValidateImportRow(
        string fullName,
        string email,
        string studentId,
        string readerType,
        string dateOfBirth)
    {
        if (fullName.Length is < 2 or > 255)
            return "Họ tên phải có từ 2 đến 255 ký tự.";
        if (!new EmailAddressAttribute().IsValid(email))
            return "Email không hợp lệ.";
        if (studentId.Length is < 1 or > 50)
            return "Mã số bắt buộc và không được vượt quá 50 ký tự.";
        if (!string.IsNullOrWhiteSpace(readerType) && !Enum.TryParse<ReaderType>(readerType, true, out _))
            return "Loại độc giả phải là Student, Lecturer hoặc External.";
        if (!string.IsNullOrWhiteSpace(dateOfBirth) && ParseDateOnly(dateOfBirth) is null)
            return "Ngày sinh phải theo định dạng yyyy-MM-dd hoặc dd/MM/yyyy.";
        return null;
    }

    private static ReaderType? ParseReaderType(string value) =>
        string.IsNullOrWhiteSpace(value)
            ? null
            : Enum.Parse<ReaderType>(value, true);

    private static DateOnly? ParseDateOnly(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var formats = new[] { "yyyy-MM-dd", "dd/MM/yyyy" };
        return DateOnly.TryParseExact(value.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : null;
    }

    private static string GetCsvValue(IReadOnlyList<string> values, IReadOnlyDictionary<string, int> headers, string column) =>
        headers.TryGetValue(column, out var index) && index < values.Count ? values[index].Trim() : string.Empty;

    private static List<List<string>> ParseCsv(string content)
    {
        var rows = new List<List<string>>();
        var row = new List<string>();
        var value = new StringBuilder();
        var inQuotes = false;

        for (var index = 0; index < content.Length; index++)
        {
            var character = content[index];
            if (character == '"')
            {
                if (inQuotes && index + 1 < content.Length && content[index + 1] == '"')
                {
                    value.Append('"');
                    index++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (character == ',' && !inQuotes)
            {
                row.Add(value.ToString());
                value.Clear();
            }
            else if ((character == '\n' || character == '\r') && !inQuotes)
            {
                if (character == '\r' && index + 1 < content.Length && content[index + 1] == '\n')
                    index++;

                row.Add(value.ToString());
                value.Clear();
                if (row.Any(cell => !string.IsNullOrWhiteSpace(cell)))
                    rows.Add(row);
                row = new List<string>();
            }
            else
            {
                value.Append(character);
            }
        }

        if (inQuotes)
            throw new ValidationException("Tệp CSV có dấu ngoặc kép chưa được đóng.");
        if (value.Length > 0 || row.Count > 0)
        {
            row.Add(value.ToString());
            if (row.Any(cell => !string.IsNullOrWhiteSpace(cell)))
                rows.Add(row);
        }

        return rows;
    }

    private sealed class SupabaseAdminUser
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
    }

    private sealed record ImportRowResult(
        int Row,
        string Email,
        bool Success,
        bool PasswordSetupEmailSent,
        string? Message);
}
