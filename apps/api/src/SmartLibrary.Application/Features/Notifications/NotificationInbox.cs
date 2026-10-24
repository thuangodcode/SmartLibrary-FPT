using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Notifications;

public sealed class NotificationInbox : INotificationInbox
{
    private static readonly TimeSpan DedupWindow = TimeSpan.FromHours(6);
    private readonly IUnitOfWork _uow;

    public NotificationInbox(IUnitOfWork uow) => _uow = uow;

    public async Task NotifyAiCredentialAsync(Guid userId, string detail, CancellationToken ct = default)
    {
        if (userId == Guid.Empty)
            return;

        var kind = AiCredentialAlert.Classify(detail);
        if (kind is null)
            return;

        var repo = _uow.Repository<Notification>();
        var since = DateTime.UtcNow.Subtract(DedupWindow);
        var existing = await repo.CountAsync(
            item => item.UserId == userId
                    && item.Type == kind
                    && !item.IsRead
                    && item.CreatedAt >= since,
            ct);
        if (existing > 0)
            return;

        await repo.AddAsync(new Notification
        {
            UserId = userId,
            Title = AiCredentialAlert.Title(kind),
            Message = AiCredentialAlert.Body(kind),
            Type = kind,
            Metadata = """{"href":"/librarian/ai-settings"}"""
        }, ct);
        await _uow.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<InboxNotificationDto>> ListMineAsync(Guid userId, CancellationToken ct = default)
    {
        var rows = await _uow.Repository<Notification>()
            .FindAsync(item => item.UserId == userId, ct);
        return rows
            .OrderBy(item => item.IsRead)
            .ThenByDescending(item => item.CreatedAt)
            .Take(20)
            .Select(Map)
            .ToList();
    }

    public async Task<bool> MarkReadAsync(Guid userId, Guid id, CancellationToken ct = default)
    {
        var item = await _uow.Repository<Notification>().GetByIdAsync(id, ct);
        if (item is null || item.UserId != userId)
            return false;
        if (!item.IsRead)
        {
            item.IsRead = true;
            await _uow.Repository<Notification>().UpdateAsync(item, ct);
            await _uow.SaveChangesAsync(ct);
        }

        return true;
    }

    private static InboxNotificationDto Map(Notification item)
        => new()
        {
            Id = item.Id,
            Title = item.Title,
            Message = item.Message,
            Type = item.Type,
            IsRead = item.IsRead,
            Href = item.Type is AiCredentialAlert.KeyType or AiCredentialAlert.QuotaType
                ? "/librarian/ai-settings"
                : null,
            CreatedAt = item.CreatedAt
        };
}
