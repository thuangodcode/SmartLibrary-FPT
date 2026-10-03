using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class UserImportBatch : AuditableEntity
{
    public Guid CreatedById { get; set; }
    public UserProfile CreatedBy { get; set; } = null!;

    public string FileName { get; set; } = string.Empty;
    public int TotalRows { get; set; }
    public int SuccessRows { get; set; }
    public int FailedRows { get; set; }
    public string? Errors { get; set; } // JSON serialized errors
}
