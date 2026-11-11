using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public sealed class CirculationReminderSetting : BaseEntity
{
    public bool IsEnabled { get; set; }
    public int ReminderDays { get; set; } = 7;
    public Guid? UpdatedBy { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
