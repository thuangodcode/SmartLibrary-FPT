using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class ReportTemplate : AuditableEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string ReportType { get; set; } = "Activity";
    public string? Description { get; set; }
    public string Configuration { get; set; } = "{}";
    public bool IsEnabled { get; set; } = true;
    public bool IsDeleted { get; set; }
    public Guid CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public ICollection<LibraryReport> Reports { get; set; } = new List<LibraryReport>();
}
