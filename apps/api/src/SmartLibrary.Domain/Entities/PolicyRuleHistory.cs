using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class PolicyRuleHistory : BaseEntity
{
    public Guid PolicyRuleId { get; set; }
    public Guid? ChangedBy { get; set; }
    public string? ChangedByName { get; set; }
    public string ChangeSummary { get; set; } = string.Empty;
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public PolicyRule? PolicyRule { get; set; }
}
