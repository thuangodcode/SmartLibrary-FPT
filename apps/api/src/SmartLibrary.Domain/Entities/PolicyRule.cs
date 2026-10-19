using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Domain.Entities;

public class PolicyRule : AuditableEntity, ISoftDeletable
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public PolicyRuleType PolicyType { get; set; }
    public PolicyRuleStatus Status { get; set; } = PolicyRuleStatus.Draft;
    public int Priority { get; set; }
    public bool OverridesGeneral { get; set; }
    public DateTime? EffectiveFrom { get; set; }
    public DateTime? EffectiveTo { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? UpdatedBy { get; set; }
    public bool IsDeleted { get; set; }

    public UserProfile? CreatedByUser { get; set; }
    public UserProfile? UpdatedByUser { get; set; }
    public ICollection<PolicyRuleParameter> Parameters { get; set; } = new List<PolicyRuleParameter>();
    public ICollection<PolicyRuleTarget> Targets { get; set; } = new List<PolicyRuleTarget>();
    public ICollection<PolicyRuleHistory> Histories { get; set; } = new List<PolicyRuleHistory>();
}
