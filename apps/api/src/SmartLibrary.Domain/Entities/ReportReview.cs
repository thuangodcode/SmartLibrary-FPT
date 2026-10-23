using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class ReportReview : BaseEntity, ISoftDeletable
{
    public Guid ReportId { get; set; }
    public LibraryReport Report { get; set; } = null!;
    public Guid ReviewerId { get; set; }
    public UserProfile Reviewer { get; set; } = null!;
    public string Action { get; set; } = "Comment";
    public string? Comment { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; }
}
