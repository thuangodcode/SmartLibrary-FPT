namespace SmartLibrary.Application.Features.Notifications;

public interface INotificationInbox
{
    Task NotifyAiCredentialAsync(Guid userId, string detail, CancellationToken ct = default);
    Task<IReadOnlyList<InboxNotificationDto>> ListMineAsync(Guid userId, CancellationToken ct = default);
    Task<bool> MarkReadAsync(Guid userId, Guid id, CancellationToken ct = default);
}
