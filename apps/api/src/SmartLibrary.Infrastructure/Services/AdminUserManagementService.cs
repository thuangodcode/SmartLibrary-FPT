using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml;
using ClosedXML.Excel;
using DocumentFormat.OpenXml.Packaging;
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
    private sealed record IdentityDocumentSummary(Guid Id, string Side, string? DocumentLast4);

    private readonly AppDbContext _dbContext;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IIdentityProvider _identityProvider;
    private readonly IRegistrationService _registrationService;
    private readonly ILogger<AdminUserManagementService> _logger;
    private readonly string _supabaseUrl;
    private readonly string _serviceRoleKey;

    public AdminUserManagementService(
        AppDbContext dbContext,
        IHttpClientFactory httpClientFactory,
        IIdentityProvider identityProvider,
        IRegistrationService registrationService,
        IConfiguration configuration,
        ILogger<AdminUserManagementService> logger)
    {
        _dbContext = dbContext;
        _httpClientFactory = httpClientFactory;
        _identityProvider = identityProvider;
        _registrationService = registrationService;
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
                (user.EmployeeId != null && user.EmployeeId.ToLower().Contains(term)) ||
                (user.Phone != null && user.Phone.Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(status) &&
            !status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (status.Equals("Inactive", StringComparison.OrdinalIgnoreCase))
            {
                users = users.Where(user => !user.IsActive);
            }
            else
            {
                if (!Enum.TryParse<AccountStatus>(status, true, out var parsedStatus))
                    throw new ValidationException("Trạng thái tài khoản không hợp lệ.");

                users = users.Where(user =>
                    user.Status == parsedStatus &&
                    (parsedStatus != AccountStatus.Active || user.IsActive));
            }
        }

        if (normalizedRole.Equals("Reader", StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(readerType) &&
            !readerType.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (!Enum.TryParse<ReaderType>(readerType, true, out var parsedReaderType))
                throw new ValidationException("Loại độc giả không hợp lệ.");

            users = users.Where(user =>
                _dbContext.RegistrationRequests.Any(registration =>
                    registration.UserId == user.Id &&
                    registration.Status == RegistrationRequestStatus.Approved)
                    ? parsedReaderType == ReaderType.External
                    : user.TeacherId != null
                        ? parsedReaderType == ReaderType.Lecturer
                        : user.StudentId != null || user.Email.ToLower().EndsWith("@fpt.edu.vn")
                            ? parsedReaderType == ReaderType.Student
                            : parsedReaderType == ReaderType.External);
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
                user.AvatarUrl,
                user.Email,
                user.StudentId,
                user.TeacherId,
                user.EmployeeId,
                user.Phone,
                ReaderType = _dbContext.RegistrationRequests.Any(registration =>
                        registration.UserId == user.Id &&
                        registration.Status == RegistrationRequestStatus.Approved)
                    ? ReaderType.External
                    : user.TeacherId != null
                        ? ReaderType.Lecturer
                        : user.StudentId != null || user.Email.ToLower().EndsWith("@fpt.edu.vn")
                            ? ReaderType.Student
                            : ReaderType.External,
                Status = user.Status.ToString(),
                user.IsActive,
                user.CreatedAt,
                RoleName = user.Role.Name
            })
            .ToListAsync(cancellationToken);

        var readerStats = await _dbContext.UserProfiles
            .IgnoreQueryFilters()
            .Where(user => !user.IsDeleted && user.Role.Name == "Reader")
            .GroupBy(user =>
                _dbContext.RegistrationRequests.Any(registration =>
                    registration.UserId == user.Id &&
                    registration.Status == RegistrationRequestStatus.Approved)
                    ? ReaderType.External
                    : user.TeacherId != null
                        ? ReaderType.Lecturer
                        : user.StudentId != null || user.Email.ToLower().EndsWith("@fpt.edu.vn")
                            ? ReaderType.Student
                            : ReaderType.External)
            .Select(group => new { ReaderType = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        var librarianStats = await _dbContext.UserProfiles
            .IgnoreQueryFilters()
            .Where(user => !user.IsDeleted && user.Role.Name == "Librarian")
            .GroupBy(user => new { user.Status, user.IsActive })
            .Select(group => new { group.Key.Status, group.Key.IsActive, Count = group.Count() })
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
                activeLibrarians = librarianStats
                    .Where(item => item.Status == AccountStatus.Active && item.IsActive)
                    .Sum(item => item.Count)
            }
        };
    }

    public async Task<object> CreateLibrarianAsync(
        CreateLibrarianRequest request,
        Guid createdBy,
        CancellationToken cancellationToken)
    {
        var fullName = request.FullName?.Trim() ?? string.Empty;
        var employeeId = request.EmployeeId?.Trim() ?? string.Empty;
        var username = request.Username?.Trim() ?? string.Empty;
        if (fullName.Length is < 2 or > 255)
            throw new ValidationException("Họ và tên phải có từ 2 đến 255 ký tự.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(employeeId, "^[a-zA-Z0-9._-]{2,50}$"))
            throw new ValidationException("Mã nhân viên chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang (2-50 ký tự).");
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

        var duplicateEmployeeId = await _dbContext.UserProfiles
            .IgnoreQueryFilters()
            .AnyAsync(user => user.EmployeeId != null && user.EmployeeId.ToLower() == employeeId.ToLower(), cancellationToken);
        if (duplicateEmployeeId)
            throw new ValidationException("Mã nhân viên này đã được sử dụng.");

        var role = await _dbContext.Set<Role>().SingleOrDefaultAsync(item => item.Name == "Librarian", cancellationToken)
            ?? throw new InvalidOperationException("Không tìm thấy role Librarian trong cơ sở dữ liệu.");

        var userId = await CreateAuthUserAsync(email, password, fullName, null, cancellationToken);
        try
        {
            var profile = await GetOrCreateProfileAsync(userId, email, fullName, role.Id, createdBy, cancellationToken);
            profile.EmployeeId = employeeId;
            profile.AvatarUrl = request.AvatarUrl;
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
                profile.AvatarUrl,
                profile.Email,
                profile.EmployeeId,
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

    public Task<object?> GetUserByIdAsync(Guid userId, CancellationToken cancellationToken) =>
        GetManagedUserDetailsAsync(userId, readerOnly: false, cancellationToken);

    public Task<object?> GetReaderByIdAsync(Guid userId, CancellationToken cancellationToken) =>
        GetManagedUserDetailsAsync(userId, readerOnly: true, cancellationToken);

    private async Task<object?> GetManagedUserDetailsAsync(
        Guid userId,
        bool readerOnly,
        CancellationToken cancellationToken)
    {
        var userQuery = GetManagedUserQuery().Where(user => user.Id == userId);
        if (readerOnly)
            userQuery = userQuery.Where(user => user.Role.Name == "Reader");

        var user = await userQuery
            .Select(user => new
            {
                user.Id,
                user.FullName,
                user.AvatarUrl,
                user.Email,
                user.StudentId,
                user.TeacherId,
                user.EmployeeId,
                user.Phone,
                user.Address,
                user.DateOfBirth,
                user.ReaderType,
                Status = user.Status.ToString(),
                user.StatusReason,
                user.IsActive,
                user.CreatedAt,
                user.LastLoginAt,
                user.MembershipExpiresAt,
                RoleName = user.Role.Name
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (user is null)
            return null;

        var registration = await _dbContext.RegistrationRequests
            .Where(request => request.UserId == userId)
            .OrderByDescending(request => request.SubmittedAt)
            .Select(request => new
            {
                request.Id,
                DocumentType = request.DocumentType.ToString(),
                Status = request.Status.ToString()
            })
            .FirstOrDefaultAsync(cancellationToken);
        var documents = registration is null
            ? new List<IdentityDocumentSummary>()
            : await _dbContext.RegistrationRequests
                .Where(request => request.Id == registration.Id)
                .SelectMany(request => request.Documents)
                .Select(document => new IdentityDocumentSummary(
                    document.Id,
                    document.Side.ToString(),
                    document.DocumentLast4))
                .ToListAsync(cancellationToken);

        return new
        {
            user.Id,
            user.FullName,
            user.AvatarUrl,
            user.Email,
            user.StudentId,
            user.TeacherId,
            user.EmployeeId,
            user.Phone,
            user.Address,
            user.DateOfBirth,
            user.ReaderType,
            user.Status,
            user.StatusReason,
            user.IsActive,
            user.CreatedAt,
            user.LastLoginAt,
            user.MembershipExpiresAt,
            user.RoleName,
            Registration = registration is null
                ? null
                : new
                {
                    registration.Id,
                    registration.DocumentType,
                    registration.Status,
                    Documents = documents
                }
        };
    }

    public async Task<string?> GetUserIdentityDocumentUrlAsync(
        Guid userId,
        Guid registrationId,
        Guid documentId,
        CancellationToken cancellationToken)
    {
        var belongsToUser = await _dbContext.RegistrationRequests
            .AnyAsync(registration =>
                registration.Id == registrationId &&
                registration.UserId == userId &&
                registration.Documents.Any(document => document.Id == documentId),
                cancellationToken);
        return belongsToUser
            ? await _registrationService.GetDocumentPresignedUrlAsync(registrationId, documentId)
            : null;
    }

    public async Task<object?> UpdateUserAsync(
        Guid userId,
        UpdateManagedUserRequest request,
        CancellationToken cancellationToken)
    {
        var user = await GetManagedUserQuery()
            .FirstOrDefaultAsync(profile => profile.Id == userId, cancellationToken);
        if (user is null)
            return null;

        var fullName = request.FullName?.Trim() ?? string.Empty;
        if (fullName.Length is < 2 or > 255)
            throw new ValidationException("Họ và tên phải có từ 2 đến 255 ký tự.");

        var phone = NormalizeOptional(request.Phone);
        var address = NormalizeOptional(request.Address);
        var studentId = NormalizeOptional(request.StudentId);
        var teacherId = NormalizeOptional(request.TeacherId);
        if (phone?.Length > 20)
            throw new ValidationException("Số điện thoại không được vượt quá 20 ký tự.");
        if (address?.Length > 500)
            throw new ValidationException("Địa chỉ không được vượt quá 500 ký tự.");
        if (studentId?.Length > 50)
            throw new ValidationException("Mã số không được vượt quá 50 ký tự.");
        if (teacherId?.Length > 50)
            throw new ValidationException("Teacher ID không được vượt quá 50 ký tự.");

        if (user.Role.Name == "Reader" && (studentId is not null || teacherId is not null) &&
            await _dbContext.UserProfiles.IgnoreQueryFilters().AnyAsync(
                profile => profile.Id != userId && !profile.IsDeleted &&
                    ((studentId != null && profile.StudentId == studentId) ||
                     (teacherId != null && profile.TeacherId == teacherId)),
                cancellationToken))
        {
            throw new ValidationException("MSSV hoặc Teacher ID này đã được sử dụng.");
        }

        DateOnly? dateOfBirth = null;
        if (!string.IsNullOrWhiteSpace(request.DateOfBirth))
        {
            if (!DateOnly.TryParseExact(
                    request.DateOfBirth,
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var parsedDate) ||
                parsedDate > DateOnly.FromDateTime(DateTime.UtcNow))
            {
                throw new ValidationException("Ngày sinh không hợp lệ.");
            }

            dateOfBirth = parsedDate;
        }

        if (user.Role.Name == "Reader" && !string.IsNullOrWhiteSpace(request.ReaderType))
        {
            if (!Enum.TryParse<ReaderType>(request.ReaderType, true, out var parsedReaderType))
                throw new ValidationException("Loại độc giả không hợp lệ.");
        }

        user.FullName = fullName;
        user.Phone = phone;
        if (user.Role.Name == "Reader")
        {
            user.Address = address;
            user.StudentId = studentId;
            user.TeacherId = teacherId;
            user.DateOfBirth = dateOfBirth;
            var hasApprovedRegistration = await _dbContext.RegistrationRequests.AnyAsync(
                registration => registration.UserId == userId &&
                    registration.Status == RegistrationRequestStatus.Approved,
                cancellationToken);
            user.ReaderType = hasApprovedRegistration
                ? ReaderType.External
                : teacherId is not null
                    ? ReaderType.Lecturer
                    : studentId is not null || user.Email.EndsWith("@fpt.edu.vn", StringComparison.OrdinalIgnoreCase)
                        ? ReaderType.Student
                        : ReaderType.External;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return await GetUserByIdAsync(userId, cancellationToken);
    }

    public async Task<object?> UpdateUserStatusAsync(
        Guid userId,
        UpdateManagedUserStatusRequest request,
        CancellationToken cancellationToken)
    {
        var user = await GetManagedUserQuery()
            .FirstOrDefaultAsync(profile => profile.Id == userId, cancellationToken);
        if (user is null)
            return null;

        if (!string.Equals(user.Role.Name, "Reader", StringComparison.Ordinal) &&
            !string.Equals(user.Role.Name, "Librarian", StringComparison.Ordinal))
        {
            throw new ValidationException("Chỉ có thể thay đổi trạng thái độc giả hoặc thủ thư.");
        }

        if (string.Equals(request.Status, "Suspended", StringComparison.OrdinalIgnoreCase))
        {
            var reason = request.Reason?.Trim() ?? string.Empty;
            if (reason.Length is < 5 or > 500)
                throw new ValidationException("Lý do ngừng hoạt động phải có từ 5 đến 500 ký tự.");

            user.IsActive = false;
            user.StatusReason = reason;
        }
        else if (string.Equals(request.Status, "Active", StringComparison.OrdinalIgnoreCase))
        {
            user.IsActive = true;
            if (user.Status == AccountStatus.Suspended)
                user.Status = AccountStatus.Active;
            user.StatusReason = null;
        }
        else
        {
            throw new ValidationException("Trạng thái chỉ được là Active hoặc Suspended.");
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return await GetUserByIdAsync(userId, cancellationToken);
    }

    private IQueryable<UserProfile> GetManagedUserQuery() =>
        _dbContext.UserProfiles
            .IgnoreQueryFilters()
            .Include(user => user.Role)
            .Where(user => !user.IsDeleted &&
                (user.Role.Name == "Reader" || user.Role.Name == "Librarian"));

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public async Task<object> ImportReadersAsync(
        string fileName,
        Stream importStream,
        Guid createdBy,
        CancellationToken cancellationToken)
    {
        var extension = Path.GetExtension(fileName);
        var rows = extension.Equals(".xlsx", StringComparison.OrdinalIgnoreCase)
            ? ReadExcelRows(importStream)
            : extension.Equals(".csv", StringComparison.OrdinalIgnoreCase)
                ? await ReadCsvRowsAsync(importStream, cancellationToken)
                : throw new ValidationException("Chỉ hỗ trợ tệp CSV hoặc Excel (.xlsx).");
        if (rows.Count < 2)
            throw new ValidationException("Tệp cần có hàng tiêu đề và ít nhất một dòng dữ liệu.");
        if (rows.Count - 1 > MaximumImportRows)
            throw new ValidationException($"Mỗi lần chỉ được nhập tối đa {MaximumImportRows} người dùng.");

        var headerCells = rows[0].Values
            .Select((name, index) => (Name: NormalizeImportHeader(name), Index: index))
            .Select(item => (Name: MapImportHeader(item.Name), item.Index))
            .Where(item => item.Name is not null)
            .Select(item => (Name: item.Name!, item.Index))
            .ToList();
        if (headerCells.GroupBy(item => item.Name, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1))
            throw new ValidationException("Tệp có tên cột bị trùng lặp.");
        var headers = headerCells.ToDictionary(item => item.Name, item => item.Index, StringComparer.OrdinalIgnoreCase);
        foreach (var required in new[] { "fullName", "studentId", "phone" })
        {
            if (!headers.ContainsKey(required))
                throw new ValidationException($"Thiếu cột bắt buộc '{required}' trong tệp.");
        }

        var readerRole = await _dbContext.Set<Role>().SingleOrDefaultAsync(item => item.Name == "Reader", cancellationToken)
            ?? throw new InvalidOperationException("Không tìm thấy role Reader trong cơ sở dữ liệu.");
        var createdByProfileExists = await _dbContext.UserProfiles
            .AnyAsync(profile => profile.Id == createdBy &&
                (profile.Role.Name == "Admin" || profile.Role.Name == "Librarian"), cancellationToken);
        if (!createdByProfileExists)
            throw new InvalidOperationException("Không thể xác định tài khoản thực hiện nhập dữ liệu.");

        var resultRows = new List<ImportRowResult>(rows.Count - 1);
        var createdCount = 0;
        var failedCount = 0;

        for (var index = 1; index < rows.Count; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var lineNumber = rows[index].RowNumber;
            var values = rows[index].Values;
            var fullName = GetCsvValue(values, headers, "fullName");
            var email = GetCsvValue(values, headers, "email");
            var studentId = GetCsvValue(values, headers, "studentId");
            var teacherId = GetCsvValue(values, headers, "teacherId");
            var phone = GetCsvValue(values, headers, "phone");
            var address = GetCsvValue(values, headers, "address");
            var readerTypeText = GetCsvValue(values, headers, "readerType");
            var birthDateText = GetCsvValue(values, headers, "dateOfBirth");

            var validationError = ValidateImportRow(
                fullName,
                email,
                phone,
                studentId,
                teacherId,
                readerTypeText,
                birthDateText);
            if (validationError is not null)
            {
                failedCount++;
                resultRows.Add(new ImportRowResult(lineNumber, studentId, false, validationError));
                continue;
            }

            var parsedReaderType = ParseReaderType(readerTypeText) ??
                (string.IsNullOrWhiteSpace(teacherId) ? ReaderType.Student : ReaderType.Lecturer);
            var normalizedStudentId = NormalizeOptional(studentId);
            var normalizedEmail = parsedReaderType == ReaderType.Student
                ? $"{normalizedStudentId!.ToLowerInvariant()}@smartlibrary.local"
                : email.Trim().ToLowerInvariant();
            if (await _dbContext.UserProfiles.IgnoreQueryFilters()
                    .AnyAsync(profile => profile.Email.ToLower() == normalizedEmail, cancellationToken))
            {
                failedCount++;
                resultRows.Add(new ImportRowResult(lineNumber, normalizedStudentId ?? email, false, "Tài khoản hoặc email đã tồn tại."));
                continue;
            }

            if (await _dbContext.UserProfiles.IgnoreQueryFilters()
                    .AnyAsync(profile =>
                        (!string.IsNullOrWhiteSpace(studentId) &&
                            profile.StudentId != null &&
                            profile.StudentId.ToLower() == studentId.Trim().ToLower()) ||
                        (!string.IsNullOrWhiteSpace(teacherId) && profile.TeacherId == teacherId.Trim()),
                        cancellationToken))
            {
                failedCount++;
                resultRows.Add(new ImportRowResult(lineNumber, normalizedStudentId ?? email, false, "MSSV hoặc Teacher ID đã tồn tại."));
                continue;
            }

            Guid? authUserId = null;
            try
            {
                authUserId = await CreateAuthUserAsync(
                    normalizedEmail,
                    phone.Trim(),
                    fullName.Trim(),
                    normalizedStudentId ?? NormalizeOptional(teacherId) ?? string.Empty,
                    cancellationToken);

                var profile = await GetOrCreateProfileAsync(
                    authUserId.Value,
                    normalizedEmail,
                    fullName.Trim(),
                    readerRole.Id,
                    createdBy,
                    cancellationToken);
                profile.StudentId = normalizedStudentId;
                profile.TeacherId = NormalizeOptional(teacherId);
                profile.Phone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();
                profile.Address = string.IsNullOrWhiteSpace(address) ? null : address.Trim();
                profile.ReaderType = parsedReaderType;
                profile.DateOfBirth = ParseDateOnly(birthDateText);
                profile.Status = AccountStatus.Active;
                profile.IsActive = true;
                profile.IsDeleted = false;
                profile.CreatedBy = createdBy;
                await _dbContext.SaveChangesAsync(cancellationToken);
                createdCount++;
                resultRows.Add(new ImportRowResult(lineNumber, normalizedStudentId ?? normalizedEmail, true, null));
            }
            catch (Exception exception) when (
                exception is HttpRequestException or DbUpdateException or InvalidOperationException or ValidationException)
            {
                if (authUserId.HasValue)
                    await TryDeleteAuthUserAsync(authUserId.Value, cancellationToken);
                _dbContext.ChangeTracker.Clear();
                failedCount++;
                _logger.LogWarning(exception, "Failed to import Reader from CSV row {RowNumber}.", lineNumber);
                resultRows.Add(new ImportRowResult(lineNumber, normalizedStudentId ?? normalizedEmail, false, "Không thể tạo tài khoản từ dòng dữ liệu này."));
            }
        }

        var batch = new UserImportBatch
        {
            CreatedById = createdBy,
            FileName = Path.GetFileName(fileName),
            TotalRows = rows.Count - 1,
            SuccessRows = createdCount,
            FailedRows = failedCount,
            Errors = JsonSerializer.Serialize(resultRows.Where(row => !row.Success))
        };
        _dbContext.UserImportBatches.Add(batch);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new
        {
            batch.Id,
            batch.TotalRows,
            batch.SuccessRows,
            batch.FailedRows,
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
        string phone,
        string studentId,
        string teacherId,
        string readerType,
        string dateOfBirth)
    {
        if (fullName.Length is < 2 or > 255)
            return "Họ tên phải có từ 2 đến 255 ký tự.";
        if (string.IsNullOrWhiteSpace(studentId))
            return "MSSV không được để trống.";
        var normalizedStudentId = studentId.Trim();
        if (normalizedStudentId.Length > 50 ||
            !char.IsLetterOrDigit(normalizedStudentId[0]) ||
            normalizedStudentId.Any(character =>
                !char.IsLetterOrDigit(character) && character is not '.' and not '_' and not '-'))
        {
            return "MSSV chỉ được chứa chữ cái, số, dấu chấm, gạch dưới hoặc gạch ngang.";
        }
        if (!IsValidInitialPassword(phone))
            return "Số điện thoại phải có từ 6 đến 30 ký tự và được dùng làm mật khẩu ban đầu.";
        if (teacherId.Length > 50)
            return "MSSV và Teacher ID không được vượt quá 50 ký tự.";
        if (!string.IsNullOrWhiteSpace(readerType) && !Enum.TryParse<ReaderType>(readerType, true, out _))
            return "Loại độc giả phải là Student, Lecturer hoặc External.";
        var parsedReaderType = ParseReaderType(readerType) ??
            (string.IsNullOrWhiteSpace(teacherId) ? ReaderType.Student : ReaderType.Lecturer);
        if (parsedReaderType != ReaderType.Student && !new EmailAddressAttribute().IsValid(email))
            return "Bạn đọc không phải sinh viên cần có email hợp lệ.";
        if (!string.IsNullOrWhiteSpace(dateOfBirth) && ParseDateOnly(dateOfBirth) is null)
            return "Ngày sinh phải theo định dạng yyyy-MM-dd hoặc dd/MM/yyyy.";
        return null;
    }

    private static ReaderType? ParseReaderType(string value) =>
        string.IsNullOrWhiteSpace(value)
            ? null
            : Enum.Parse<ReaderType>(value, true);

    private static bool IsValidInitialPassword(string phone)
    {
        var value = phone.Trim();
        return value.Length is >= 6 and <= 30 &&
            value.Count(char.IsDigit) >= 6 &&
            value.All(character => char.IsDigit(character) || character is '+' or ' ' or '-' or '(' or ')') &&
            (!value.Contains('+') || value[0] == '+');
    }

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

    private static string NormalizeImportHeader(string value)
    {
        var normalized = value.Trim().TrimStart('\uFEFF').Normalize(NormalizationForm.FormD);
        var result = new StringBuilder(normalized.Length);
        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
                continue;
            if (character is 'đ' or 'Đ')
                result.Append('d');
            else if (char.IsLetterOrDigit(character))
                result.Append(char.ToLowerInvariant(character));
        }

        return result.ToString();
    }

    private static string? MapImportHeader(string normalizedHeader) => normalizedHeader switch
    {
        "fullname" or "hovaten" or "hoten" => "fullName",
        "email" or "emailcanhan" => "email",
        "studentid" or "mssv" or "masinhvien" or "masosinhvien" => "studentId",
        "teacherid" or "magiaovien" => "teacherId",
        "phone" or "sodienthoai" or "sdt" => "phone",
        "readertype" or "loainguoidoc" => "readerType",
        "address" or "diachi" => "address",
        "dateofbirth" or "ngaysinh" => "dateOfBirth",
        _ => null
    };

    private static async Task<List<ImportSourceRow>> ReadCsvRowsAsync(
        Stream stream,
        CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(
            stream,
            Encoding.UTF8,
            detectEncodingFromByteOrderMarks: true,
            leaveOpen: true);
        var contents = await reader.ReadToEndAsync(cancellationToken);
        return ParseCsv(contents);
    }

    private static List<ImportSourceRow> ReadExcelRows(Stream stream)
    {
        try
        {
            using var workbook = new XLWorkbook(stream);
            var worksheet = workbook.Worksheets.FirstOrDefault()
                ?? throw new ValidationException("Tệp Excel không có trang tính.");
            var lastUsedRow = worksheet.LastRowUsed()?.RowNumber() ?? 0;
            var lastUsedColumn = worksheet.Row(1).LastCellUsed()?.Address.ColumnNumber ?? 0;
            if (lastUsedRow > MaximumImportRows + 1)
                throw new ValidationException($"Mỗi lần chỉ được nhập tối đa {MaximumImportRows} người dùng.");
            if (lastUsedRow == 0 || lastUsedColumn == 0)
                return [];

            var rows = new List<ImportSourceRow>(lastUsedRow);
            for (var rowNumber = 1; rowNumber <= lastUsedRow; rowNumber++)
            {
                var row = worksheet.Row(rowNumber);
                var values = Enumerable.Range(1, lastUsedColumn)
                    .Select(columnNumber => GetExcelCellValue(row.Cell(columnNumber)))
                    .ToList();
                if (values.Any(value => !string.IsNullOrWhiteSpace(value)))
                    rows.Add(new ImportSourceRow(rowNumber, values));
            }

            return rows;
        }
        catch (ValidationException)
        {
            throw;
        }
        catch (Exception exception) when (
            exception is ArgumentException or InvalidDataException or IOException or XmlException or OpenXmlPackageException)
        {
            throw new ValidationException("Tệp Excel không hợp lệ hoặc không thể đọc.");
        }
    }

    private static string GetExcelCellValue(IXLCell cell) =>
        cell.DataType == XLDataType.DateTime
            ? cell.GetDateTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : cell.GetFormattedString().Trim();

    private static List<ImportSourceRow> ParseCsv(string content)
    {
        var rows = new List<ImportSourceRow>();
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
                    rows.Add(new ImportSourceRow(rows.Count + 1, row));
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
                rows.Add(new ImportSourceRow(rows.Count + 1, row));
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
        string Identifier,
        bool Success,
        string? Message);

    private sealed record ImportSourceRow(int RowNumber, List<string> Values);
}
