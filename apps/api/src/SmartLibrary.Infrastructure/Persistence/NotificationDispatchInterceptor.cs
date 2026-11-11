using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SmartLibrary.Application.Features.Notifications;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence;

public sealed class NotificationDispatchInterceptor(INotificationRealtimePublisher publisher) : SaveChangesInterceptor
{
    private readonly List<Notification> _pending = [];

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData, InterceptionResult<int> result)
    {
        Capture(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Capture(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        PublishAsync(CancellationToken.None).GetAwaiter().GetResult();
        return base.SavedChanges(eventData, result);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        await PublishAsync(cancellationToken);
        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData)
    {
        _pending.Clear();
        base.SaveChangesFailed(eventData);
    }

    public override Task SaveChangesFailedAsync(
        DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        _pending.Clear();
        return base.SaveChangesFailedAsync(eventData, cancellationToken);
    }

    private void Capture(DbContext? context)
    {
        _pending.Clear();
        if (context is null) return;
        _pending.AddRange(context.ChangeTracker.Entries<Notification>()
            .Where(entry => entry.State == EntityState.Added)
            .Select(entry => entry.Entity));
    }

    private async Task PublishAsync(CancellationToken ct)
    {
        var notifications = _pending.Select(NotificationInbox.Map).ToList();
        _pending.Clear();
        foreach (var notification in notifications)
            await publisher.PublishCreatedAsync(notification, ct);
    }
}
