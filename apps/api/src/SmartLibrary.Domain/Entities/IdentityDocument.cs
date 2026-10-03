using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Domain.Entities;

public class IdentityDocument : AuditableEntity, ISoftDeletable
{
    public Guid RequestId { get; set; }
    public RegistrationRequest Request { get; set; } = null!;

    public DocumentSide Side { get; set; }
    public string StoragePath { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public string? DocumentLast4 { get; set; }

    public bool IsDeleted { get; set; }
}
