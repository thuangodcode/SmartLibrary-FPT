using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class Role : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    public ICollection<RolePermission> RolePermissions { get; set; } = new List<RolePermission>();
    public ICollection<UserProfile> UserProfiles { get; set; } = new List<UserProfile>();
}
