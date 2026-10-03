using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using System.Security.Cryptography;

namespace SmartLibrary.Application.Features.Auth.Services;

public class RegistrationService : IRegistrationService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IStorageService _storageService;
    private readonly IEmailService _emailService;
    private readonly string _connectionString;

    public RegistrationService(IUnitOfWork unitOfWork, IStorageService storageService, IEmailService emailService, IConfiguration configuration)
    {
        _unitOfWork = unitOfWork;
        _storageService = storageService;
        _emailService = emailService;
        _connectionString = configuration.GetConnectionString("DefaultConnection") ?? "";
    }

    public async Task<PaginatedList<RegistrationDto>> GetPendingRegistrationsAsync(string? status, string? query, DateTime? from, DateTime? to, int page, int pageSize)
    {
        var q = _unitOfWork.Repository<RegistrationRequest>()
            .Query()
            .Include(r => r.User)
            .Include(r => r.Documents)
            .AsNoTracking();

        if (!string.IsNullOrEmpty(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (Enum.TryParse<RegistrationRequestStatus>(status, true, out var parsedStatus))
            {
                q = q.Where(r => r.Status == parsedStatus);
            }
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var lowerQuery = query.Trim().ToLower();
            q = q.Where(r => r.User.FullName.ToLower().Contains(lowerQuery) ||
                             r.User.Email.ToLower().Contains(lowerQuery) ||
                             (r.User.Phone != null && r.User.Phone.Contains(lowerQuery)));
        }

        if (from.HasValue)
        {
            q = q.Where(r => r.SubmittedAt >= from.Value.ToUniversalTime());
        }

        if (to.HasValue)
        {
            q = q.Where(r => r.SubmittedAt <= to.Value.ToUniversalTime());
        }

        var total = await q.CountAsync();
        var items = await q.OrderByDescending(r => r.SubmittedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new RegistrationDto
            {
                Id = r.Id,
                FullName = r.User.FullName,
                Email = r.User.Email,
                Phone = r.User.Phone,
                Address = r.User.Address,
                DateOfBirth = r.User.DateOfBirth,
                DocumentType = r.DocumentType,
                SubmittedAt = r.SubmittedAt,
                Status = r.Status,
                FrontDocUrl = r.Documents.Where(d => d.Side == DocumentSide.Front).Select(d => d.StoragePath).FirstOrDefault(),
                BackDocUrl = r.Documents.Where(d => d.Side == DocumentSide.Back).Select(d => d.StoragePath).FirstOrDefault(),
                SelfieUrl = r.Documents.Where(d => d.Side == DocumentSide.Selfie).Select(d => d.StoragePath).FirstOrDefault()
            })
            .ToListAsync();

        return new PaginatedList<RegistrationDto>(items, total, page, pageSize);
    }

    public async Task<RegistrationDetailDto> GetRegistrationDetailAsync(Guid id)
    {
        var req = await _unitOfWork.Repository<RegistrationRequest>()
            .Query()
            .Include(r => r.User)
            .Include(r => r.Documents)
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id);

        if (req == null)
            throw new Exception("Registration request not found.");

        return new RegistrationDetailDto
        {
            Id = req.Id,
            FullName = req.User.FullName,
            Email = req.User.Email,
            Phone = req.User.Phone,
            Address = req.User.Address,
            DateOfBirth = req.User.DateOfBirth,
            DocumentType = req.DocumentType,
            SubmittedAt = req.SubmittedAt,
            Status = req.Status,
            AttemptNo = req.AttemptNo,
            FrontDocUrl = req.Documents.Where(d => d.Side == DocumentSide.Front).Select(d => d.StoragePath).FirstOrDefault(),
            BackDocUrl = req.Documents.Where(d => d.Side == DocumentSide.Back).Select(d => d.StoragePath).FirstOrDefault(),
            SelfieUrl = req.Documents.Where(d => d.Side == DocumentSide.Selfie).Select(d => d.StoragePath).FirstOrDefault(),
            Documents = req.Documents.Select(d => new DocumentDto
            {
                Id = d.Id,
                Side = d.Side,
                DocumentLast4 = d.DocumentLast4,
                Url = d.StoragePath
            }).ToList()
        };
    }

    public async Task<string> GetDocumentPresignedUrlAsync(Guid id, Guid documentId)
    {
        var doc = await _unitOfWork.Repository<IdentityDocument>().Query().FirstOrDefaultAsync(d => d.Id == documentId && d.RequestId == id);
        if (doc == null) throw new Exception("Document not found");

        if (doc.StoragePath.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            return doc.StoragePath;
        
        return await _storageService.CreatePresignedUrlAsync(doc.StoragePath, "identity-documents", 60);
    }

    public async Task ApproveRegistrationAsync(Guid id, Guid reviewerId, DateTime? membershipExpiresAt, string? note)
    {
        var req = await _unitOfWork.Repository<RegistrationRequest>().Query().Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);
        if (req == null) throw new Exception("Không tìm thấy đơn đăng ký.");
        if (req.Status == RegistrationRequestStatus.Approved)
        {
            req.User.Status = AccountStatus.Active;
            await _unitOfWork.SaveChangesAsync();
            return;
        }
        if (req.Status != RegistrationRequestStatus.Submitted) 
            throw new Exception("Đơn đăng ký không ở trạng thái chờ duyệt.");

        req.Status = RegistrationRequestStatus.Approved;
        if (reviewerId != Guid.Empty && await _unitOfWork.Repository<UserProfile>().Query().AnyAsync(u => u.Id == reviewerId))
        {
            req.ReviewedById = reviewerId;
        }
        req.ReviewedAt = DateTime.UtcNow;
        req.Note = note;

        req.User.Status = AccountStatus.Active;
        req.User.MembershipExpiresAt = membershipExpiresAt ?? DateTime.UtcNow.AddYears(1);

        await _unitOfWork.SaveChangesAsync();
        try
        {
            await _emailService.SendEmailAsync(req.User.Email, "Account Approved", "Hồ sơ của bạn đã được phê duyệt.");
        }
        catch { }
    }

    public async Task RejectRegistrationAsync(Guid id, Guid reviewerId, string reason)
    {
        var req = await _unitOfWork.Repository<RegistrationRequest>().Query().Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);
        if (req == null) throw new Exception("Không tìm thấy đơn đăng ký.");
        if (req.Status == RegistrationRequestStatus.Rejected)
        {
            return;
        }
        {
            req.ReviewedById = reviewerId;
        }
        req.ReviewedAt = DateTime.UtcNow;
        req.RejectReason = reason;

        req.User.Status = AccountStatus.Rejected;

        await _unitOfWork.SaveChangesAsync();
        try
        {
            await _emailService.SendEmailAsync(req.User.Email, "Account Rejected", $"Lý do từ chối: {reason}");
        }
        catch { }
    }

    public async Task RequestMoreInfoAsync(Guid id, Guid reviewerId, string note)
    {
        var req = await _unitOfWork.Repository<RegistrationRequest>().Query().Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);
        if (req == null) throw new Exception("Request not found");

        req.Status = RegistrationRequestStatus.NeedMoreInfo;
        if (reviewerId != Guid.Empty && await _unitOfWork.Repository<UserProfile>().Query().AnyAsync(u => u.Id == reviewerId))
        {
            req.ReviewedById = reviewerId;
        }
        req.ReviewedAt = DateTime.UtcNow;
        req.Note = note;

        req.User.Status = AccountStatus.PendingDocuments;

        await _unitOfWork.SaveChangesAsync();
        try
        {
            await _emailService.SendEmailAsync(req.User.Email, "More info required", $"Yêu cầu bổ sung thông tin: {note}");
        }
        catch { }
    }

    public async Task SubmitDocumentsAsync(Guid userId, DocumentType documentType, IFormFile? front, IFormFile? back, IFormFile? selfie)
    {
        var user = await _unitOfWork.Repository<UserProfile>().GetByIdAsync(userId);
        if (user == null || user.Status != AccountStatus.PendingDocuments) throw new Exception("Invalid user state");

        var request = new RegistrationRequest
        {
            UserId = userId,
            DocumentType = documentType,
            Status = RegistrationRequestStatus.Submitted
        };
        await _unitOfWork.Repository<RegistrationRequest>().AddAsync(request);
        await _unitOfWork.SaveChangesAsync(); // to get request.Id

        var docs = new List<IdentityDocument>();
        if (front != null) docs.Add(await ProcessDocument(front, request.Id, userId, DocumentSide.Front));
        if (back != null) docs.Add(await ProcessDocument(back, request.Id, userId, DocumentSide.Back));
        if (selfie != null) docs.Add(await ProcessDocument(selfie, request.Id, userId, DocumentSide.Selfie));

        foreach (var d in docs)
        {
            await _unitOfWork.Repository<IdentityDocument>().AddAsync(d);
        }

        user.Status = AccountStatus.PendingApproval;
        await _unitOfWork.SaveChangesAsync();
    }

    private async Task<IdentityDocument> ProcessDocument(IFormFile file, Guid requestId, Guid userId, DocumentSide side)
    {
        var fileName = $"{userId}_{requestId}_{side.ToString().ToLower()}.jpg";
        using var stream = file.OpenReadStream();
        var uploadedUrl = await _storageService.UploadFileAsync(stream, fileName, "identity-documents");
        
        return new IdentityDocument
        {
            RequestId = requestId,
            Side = side,
            StoragePath = uploadedUrl,
            MimeType = file.ContentType ?? "image/jpeg",
            SizeBytes = file.Length,
            Sha256 = "dummy_hash"
        };
    }

    public async Task<Guid> RegisterExternalReaderAsync(
        RegisterExternalReaderRequest request, 
        IFormFile? front, 
        IFormFile? back, 
        IFormFile? selfie, 
        CancellationToken ct = default)
    {
        var cleanEmail = request.Email.Trim().ToLowerInvariant();
        var requestId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        // 1. Upload documents to Cloudinary
        string? frontUrl = null;
        if (front != null && front.Length > 0)
        {
            var fileName = $"{Guid.NewGuid()}_front.jpg";
            using var stream = front.OpenReadStream();
            frontUrl = await _storageService.UploadFileAsync(stream, fileName, "identity-documents", ct);
        }

        string? backUrl = null;
        if (back != null && back.Length > 0)
        {
            var fileName = $"{Guid.NewGuid()}_back.jpg";
            using var stream = back.OpenReadStream();
            backUrl = await _storageService.UploadFileAsync(stream, fileName, "identity-documents", ct);
        }

        string? selfieUrl = null;
        if (selfie != null && selfie.Length > 0)
        {
            var fileName = $"{Guid.NewGuid()}_selfie.jpg";
            using var stream = selfie.OpenReadStream();
            selfieUrl = await _storageService.UploadFileAsync(stream, fileName, "identity-documents", ct);
        }

        // 2. Database transaction via NpgsqlConnection
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        try
        {
            // Find Reader role
            var readerRoleId = Guid.Empty;
            await using (var rCmd = new NpgsqlCommand("SELECT id FROM roles WHERE name = 'Reader' LIMIT 1;", conn, tx))
            {
                var rid = await rCmd.ExecuteScalarAsync(ct);
                if (rid is Guid g) readerRoleId = g;
            }

            // Check if user already exists
            await using (var checkCmd = new NpgsqlCommand("SELECT id, status FROM profiles WHERE LOWER(email) = LOWER(@email);", conn, tx))
            {
                checkCmd.Parameters.AddWithValue("email", cleanEmail);
                await using var reader = await checkCmd.ExecuteReaderAsync(ct);
                if (await reader.ReadAsync(ct))
                {
                    var existingId = reader.GetGuid(0);
                    var status = reader.GetString(1);
                    if (status.Equals("Active", StringComparison.OrdinalIgnoreCase))
                    {
                        throw new Exception("Email này đã được sử dụng và tài khoản đang kích hoạt.");
                    }
                    userId = existingId;
                }
            }

            // Upsert auth.users with encrypted password
            var authUserSql = @"
                INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
                VALUES (@id, '00000000-0000-0000-0000-000000000000', @email, crypt(@password, gen_salt('bf')), NOW(), '{""provider"":""email"",""providers"":[""email""]}'::jsonb, json_build_object('full_name', @fullName)::jsonb, NOW(), NOW(), 'authenticated', 'authenticated')
                ON CONFLICT (id) DO UPDATE SET 
                    email = EXCLUDED.email,
                    encrypted_password = crypt(@password, gen_salt('bf')),
                    updated_at = NOW();
            ";
            await using (var aCmd = new NpgsqlCommand(authUserSql, conn, tx))
            {
                aCmd.Parameters.AddWithValue("id", userId);
                aCmd.Parameters.AddWithValue("email", cleanEmail);
                aCmd.Parameters.AddWithValue("password", request.Password);
                aCmd.Parameters.AddWithValue("fullName", request.FullName);
                await aCmd.ExecuteNonQueryAsync(ct);
            }

            // Upsert profiles
            var profileSql = @"
                INSERT INTO profiles (id, email, full_name, phone, address, date_of_birth, role_id, status, is_active, is_deleted, created_at, updated_at)
                VALUES (@id, @email, @fullName, @phone, @address, @dob::date, @roleId, 'PendingApproval'::account_status, true, false, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    phone = EXCLUDED.phone,
                    address = EXCLUDED.address,
                    date_of_birth = EXCLUDED.date_of_birth,
                    status = 'PendingApproval'::account_status,
                    updated_at = NOW();
            ";
            await using (var pCmd = new NpgsqlCommand(profileSql, conn, tx))
            {
                pCmd.Parameters.AddWithValue("id", userId);
                pCmd.Parameters.AddWithValue("email", cleanEmail);
                pCmd.Parameters.AddWithValue("fullName", request.FullName);
                pCmd.Parameters.AddWithValue("phone", (object?)request.Phone ?? DBNull.Value);
                pCmd.Parameters.AddWithValue("address", (object?)request.Address ?? DBNull.Value);
                pCmd.Parameters.AddWithValue("dob", !string.IsNullOrEmpty(request.DateOfBirth) ? (object)request.DateOfBirth : DBNull.Value);
                pCmd.Parameters.AddWithValue("roleId", readerRoleId != Guid.Empty ? (object)readerRoleId : DBNull.Value);
                await pCmd.ExecuteNonQueryAsync(ct);
            }

            // Insert registration_requests
            var reqSql = @"
                INSERT INTO registration_requests (id, user_id, document_type, attempt_no, status, submitted_at, created_at, updated_at)
                VALUES (@reqId, @userId, @docType::document_type, 1, 'Submitted'::registration_request_status, NOW(), NOW(), NOW());
            ";
            await using (var reqCmd = new NpgsqlCommand(reqSql, conn, tx))
            {
                reqCmd.Parameters.AddWithValue("reqId", requestId);
                reqCmd.Parameters.AddWithValue("userId", userId);
                reqCmd.Parameters.AddWithValue("docType", request.DocumentType.ToString());
                await reqCmd.ExecuteNonQueryAsync(ct);
            }

            // Insert identity_documents
            if (!string.IsNullOrEmpty(frontUrl))
            {
                var docSql = @"
                    INSERT INTO identity_documents (id, request_id, side, storage_path, mime_type, size_bytes, sha256, created_at)
                    VALUES (gen_random_uuid(), @reqId, 'Front'::document_side, @url, @mime, @size, 'hash', NOW());
                ";
                await using var docCmd = new NpgsqlCommand(docSql, conn, tx);
                docCmd.Parameters.AddWithValue("reqId", requestId);
                docCmd.Parameters.AddWithValue("url", frontUrl);
                docCmd.Parameters.AddWithValue("mime", front?.ContentType ?? "image/jpeg");
                docCmd.Parameters.AddWithValue("size", front?.Length ?? 0);
                await docCmd.ExecuteNonQueryAsync(ct);
            }

            if (!string.IsNullOrEmpty(backUrl))
            {
                var docSql = @"
                    INSERT INTO identity_documents (id, request_id, side, storage_path, mime_type, size_bytes, sha256, created_at)
                    VALUES (gen_random_uuid(), @reqId, 'Back'::document_side, @url, @mime, @size, 'hash', NOW());
                ";
                await using var docCmd = new NpgsqlCommand(docSql, conn, tx);
                docCmd.Parameters.AddWithValue("reqId", requestId);
                docCmd.Parameters.AddWithValue("url", backUrl);
                docCmd.Parameters.AddWithValue("mime", back?.ContentType ?? "image/jpeg");
                docCmd.Parameters.AddWithValue("size", back?.Length ?? 0);
                await docCmd.ExecuteNonQueryAsync(ct);
            }

            if (!string.IsNullOrEmpty(selfieUrl))
            {
                var docSql = @"
                    INSERT INTO identity_documents (id, request_id, side, storage_path, mime_type, size_bytes, sha256, created_at)
                    VALUES (gen_random_uuid(), @reqId, 'Selfie'::document_side, @url, @mime, @size, 'hash', NOW());
                ";
                await using var docCmd = new NpgsqlCommand(docSql, conn, tx);
                docCmd.Parameters.AddWithValue("reqId", requestId);
                docCmd.Parameters.AddWithValue("url", selfieUrl);
                docCmd.Parameters.AddWithValue("mime", selfie?.ContentType ?? "image/jpeg");
                docCmd.Parameters.AddWithValue("size", selfie?.Length ?? 0);
                await docCmd.ExecuteNonQueryAsync(ct);
            }

            await tx.CommitAsync(ct);
            return requestId;
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }
}
