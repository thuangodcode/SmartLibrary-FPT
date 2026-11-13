using System.Text.Json;
using Microsoft.EntityFrameworkCore;
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
        var selected = rows
            .OrderBy(item => item.IsRead)
            .ThenByDescending(item => item.CreatedAt)
            .Take(20).ToList();
        var items = selected.Select(Map).ToList();
        await LegacyNotificationTargets.FillAsync(_uow, userId, selected, items, ct);
        return items;
    }

    public async Task<InboxNotificationPageDto> ListMineAsync(
        Guid userId, int page, int pageSize, CancellationToken ct = default)
    {
        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 50);
        var query = _uow.Repository<Notification>().Query()
            .AsNoTracking()
            .Where(item => item.UserId == userId);
        var totalCount = await query.CountAsync(ct);
        var unreadCount = await query.CountAsync(item => !item.IsRead, ct);
        var items = await query
            .OrderBy(item => item.IsRead)
            .ThenByDescending(item => item.CreatedAt)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToListAsync(ct);

        var mapped = items.Select(Map).ToList();
        await LegacyNotificationTargets.FillAsync(_uow, userId, items, mapped, ct);
        return new InboxNotificationPageDto
        {
            Items = mapped,
            Page = safePage,
            PageSize = safePageSize,
            TotalCount = totalCount,
            TotalPages = (int)Math.Ceiling(totalCount / (double)safePageSize),
            UnreadCount = unreadCount
        };
    }

    public Task<int> CountUnreadAsync(Guid userId, CancellationToken ct = default)
        => _uow.Repository<Notification>().Query()
            .CountAsync(item => item.UserId == userId && !item.IsRead, ct);

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

    public async Task<int> MarkAllReadAsync(Guid userId, CancellationToken ct = default)
    {
        var items = await _uow.Repository<Notification>().Query()
            .Where(item => item.UserId == userId && !item.IsRead)
            .ToListAsync(ct);
        foreach (var item in items)
            item.IsRead = true;
        if (items.Count > 0)
            await _uow.SaveChangesAsync(ct);
        return items.Count;
    }

    public static InboxNotificationDto Map(Notification item)
        => new()
        {
            Id = item.Id,
            UserId = item.UserId,
            Title = item.Title,
            Message = item.Message,
            Type = item.Type,
            IsRead = item.IsRead,
            Href = ResolveHref(item),
            CreatedAt = item.CreatedAt
        };

    private static string? ResolveHref(Notification item)
    {
        string? explicitHref = null;
        Guid? entityId = null;
        Guid? bookId = null;
        if (!string.IsNullOrWhiteSpace(item.Metadata))
        {
            try
            {
                using var document = JsonDocument.Parse(item.Metadata);
                var root = document.RootElement;
                if (root.ValueKind == JsonValueKind.Object)
                {
                    if (root.TryGetProperty("href", out var href) && href.ValueKind == JsonValueKind.String)
                    {
                        var value = href.GetString();
                        if (value?.StartsWith('/') == true && !value.StartsWith("//") && !value.Contains('\\'))
                            explicitHref = value;
                    }
                    entityId = ReadId(root, "entityId") ?? ReadId(root, "loanId") ?? ReadId(root, "borrowRecordId") ?? ReadId(root, "fineId");
                    bookId = ReadId(root, "bookId");
                }
            }
            catch (JsonException)
            {
                // Legacy metadata must not prevent the inbox from opening.
            }
        }

        var fallback = item.Type switch
        {
            AiCredentialAlert.KeyType or AiCredentialAlert.QuotaType => "/librarian/ai-settings",
            "borrow" or "return" or "renewal" or "due_soon" or "overdue" or "due_date_email_reminder" => "/history?tab=loans",
            "fine" or "fine_paid" or "fine_payment_reconciliation" => "/history?tab=fines",
            "reservation" => "/books",
            "support" => "/support",
            "membership_expiring" => "/profile",
            _ => null
        };
        // Upgrade old generic links only when the producer stored a known entity ID.
        if (explicitHref is not null && explicitHref is not ("/history?tab=loans" or "/history?tab=fines" or "/books")) return explicitHref;
        if (entityId.HasValue && fallback == "/history?tab=loans")
            return $"{fallback}&loanId={entityId:D}";
        if (entityId.HasValue && fallback == "/history?tab=fines")
            return $"{fallback}&fineId={entityId:D}";
        // A reservation entityId is a reservation ID, not a book ID.
        if (bookId.HasValue && item.Type == "reservation") return $"/books/{bookId:D}";
        // A generic list is not a valid substitute for an unknown circulation
        // target. Legacy rows are resolved against owned records when listed;
        // notices about a failed request with no record remain informational.
        if (fallback is "/history?tab=loans" or "/history?tab=fines" or "/books") return null;
        return explicitHref ?? fallback;
    }

    private static Guid? ReadId(JsonElement root, string key)
        => root.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
           && Guid.TryParse(value.GetString(), out var id) && id != Guid.Empty ? id : null;
}
