using SmartLibrary.Application.Common;
using SmartLibrary.Domain.Enums;
using Microsoft.AspNetCore.Http;

namespace SmartLibrary.Application.Interfaces;

public interface IRegistrationService
{
    Task<PaginatedList<RegistrationDto>> GetPendingRegistrationsAsync(string? status, string? query, DateTime? from, DateTime? to, int page, int pageSize);
    Task<RegistrationDetailDto> GetRegistrationDetailAsync(Guid id);
    Task<string> GetDocumentPresignedUrlAsync(Guid id, Guid documentId);
    
    Task ApproveRegistrationAsync(Guid id, Guid reviewerId, DateTime? membershipExpiresAt, string? note);
    Task RejectRegistrationAsync(Guid id, Guid reviewerId, string reason);
    Task RequestMoreInfoAsync(Guid id, Guid reviewerId, string note);
    
    Task SubmitDocumentsAsync(Guid userId, DocumentType documentType, IFormFile? front, IFormFile? back, IFormFile? selfie);
    Task<Guid> RegisterExternalReaderAsync(RegisterExternalReaderRequest request, IFormFile? front, IFormFile? back, IFormFile? selfie, CancellationToken ct = default);
}

public class RegisterExternalReaderRequest
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public string? DateOfBirth { get; set; }
    public DocumentType DocumentType { get; set; }
}

public class RegistrationDto
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Address { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public DocumentType DocumentType { get; set; }
    public DateTime SubmittedAt { get; set; }
    public RegistrationRequestStatus Status { get; set; }
    public string? FrontDocUrl { get; set; }
    public string? BackDocUrl { get; set; }
    public string? SelfieUrl { get; set; }
}

public class RegistrationDetailDto : RegistrationDto
{
    public int AttemptNo { get; set; }
    public List<DocumentDto> Documents { get; set; } = new();
}

public class DocumentDto
{
    public Guid Id { get; set; }
    public DocumentSide Side { get; set; }
    public string? DocumentLast4 { get; set; }
    public string? Url { get; set; }
}
