namespace SmartLibrary.Application.Features.Notifications;

public class InboxNotificationDto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool IsRead { get; set; }
    public string? Href { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class InboxNotificationPageDto
{
    public IReadOnlyList<InboxNotificationDto> Items { get; set; } = [];
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages { get; set; }
    public int UnreadCount { get; set; }
}

public interface INotificationRealtimePublisher
{
    Task PublishCreatedAsync(InboxNotificationDto notification, CancellationToken ct = default);
}
