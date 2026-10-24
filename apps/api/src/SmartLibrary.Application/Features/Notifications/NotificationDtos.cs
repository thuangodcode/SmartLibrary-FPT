namespace SmartLibrary.Application.Features.Notifications;

public class InboxNotificationDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool IsRead { get; set; }
    public string? Href { get; set; }
    public DateTime CreatedAt { get; set; }
}
