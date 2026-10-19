using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class PolicyRuleParameter : BaseEntity
{
    public Guid PolicyRuleId { get; set; }
    public string ParamKey { get; set; } = string.Empty;
    public string ParamValue { get; set; } = string.Empty;
    public string? DisplayLabel { get; set; }

    public PolicyRule PolicyRule { get; set; } = null!;
}
