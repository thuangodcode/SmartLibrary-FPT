using Microsoft.AspNetCore.SignalR;
using SmartLibrary.Api.Hubs;
using SmartLibrary.Application.Features.Notifications;

namespace SmartLibrary.Api.Services;

public sealed class SignalRNotificationPublisher(
    IHubContext<NotificationHub> hub,
    ILogger<SignalRNotificationPublisher> logger) : INotificationRealtimePublisher
{
    public async Task PublishCreatedAsync(InboxNotificationDto notification, CancellationToken ct = default)
    {
        try
        {
            await hub.Clients.Group(NotificationHub.UserGroup(notification.UserId))
                .SendAsync("NotificationCreated", notification, ct);
        }
        catch (Exception exception)
        {
            // Persistence has already succeeded. Realtime delivery must never roll back the business action.
            logger.LogWarning(exception, "Could not deliver notification {NotificationId} in realtime.", notification.Id);
        }
    }
}
