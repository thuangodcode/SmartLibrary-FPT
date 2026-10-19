using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class PolicyRuleTarget : BaseEntity
{
    public Guid PolicyRuleId { get; set; }
    public string TargetType { get; set; } = string.Empty;
    public string TargetValue { get; set; } = string.Empty;
    public string? TargetLabel { get; set; }

    public PolicyRule PolicyRule { get; set; } = null!;
}
