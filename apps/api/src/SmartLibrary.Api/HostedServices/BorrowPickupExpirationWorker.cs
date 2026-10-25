using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SmartLibrary.Api.Hubs;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.HostedServices;

public sealed class BorrowPickupExpirationWorker(
    IServiceScopeFactory scopeFactory,
    IHubContext<NotificationHub> hub,
    ILogger<BorrowPickupExpirationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
                using var scope = scopeFactory.CreateScope();
                var circulation = scope.ServiceProvider.GetRequiredService<CirculationService>();
                await circulation.MarkOverdueAsync(stoppingToken);
                await circulation.ProcessReservationExpirationsAsync(stoppingToken);
                await CreateRemindersAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), stoppingToken);
                var expired = await circulation.ExpireUncollectedPickupsAsync(stoppingToken);
                foreach (var loan in expired)
                {
                    await hub.Clients.Group(NotificationHub.UserGroup(loan.ReaderId))
                        .SendAsync("BorrowStatusUpdated", loan, stoppingToken);
                    await hub.Clients.Group(NotificationHub.LibrarianGroup)
                        .SendAsync("BorrowRequestUpdated", loan, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Failed to expire uncollected borrow requests.");
            }
        }
    }

    private static async Task CreateRemindersAsync(AppDbContext db, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var dueSoon = await db.BorrowRecords.AsNoTracking()
            .Where(loan => loan.Status == BorrowStatus.Borrowed
                           && loan.DueDate != null
                           && loan.DueDate > now
                           && loan.DueDate <= now.AddHours(24))
            .Select(loan => new
            {
                loan.Id,
                loan.ReaderId,
                loan.DueDate,
                loan.BookCopy.Book.Title
            })
            .ToListAsync(ct);

        var memberships = await db.UserProfiles.AsNoTracking()
            .Where(user => user.Role.Name == "Reader"
                           && user.IsActive
                           && user.MembershipExpiresAt != null
                           && user.MembershipExpiresAt >= now
                           && user.MembershipExpiresAt <= now.AddDays(7))
            .Select(user => new { user.Id, user.MembershipExpiresAt })
            .ToListAsync(ct);

        var userIds = dueSoon.Select(item => item.ReaderId)
            .Concat(memberships.Select(item => item.Id))
            .Distinct()
            .ToList();
        var existing = await db.Notifications.AsNoTracking()
            .Where(item => userIds.Contains(item.UserId)
                           && (item.Type == "due_soon" || item.Type == "membership_expiring"))
            .Select(item => new { item.UserId, item.Type, item.Metadata })
            .ToListAsync(ct);
        var existingKeys = existing
            .Select(item => $"{item.UserId:N}|{item.Type}|{item.Metadata}")
            .ToHashSet(StringComparer.Ordinal);

        foreach (var loan in dueSoon)
        {
            var metadata = JsonSerializer.Serialize(new
            {
                href = "/history?tab=loans",
                entityId = loan.Id
            });
            if (!existingKeys.Add($"{loan.ReaderId:N}|due_soon|{metadata}")) continue;
            db.Notifications.Add(new Notification
            {
                UserId = loan.ReaderId,
                Title = "Sách sắp đến hạn trả",
                Message = $"“{loan.Title}” sẽ đến hạn lúc {loan.DueDate:dd/MM/yyyy HH:mm}.",
                Type = "due_soon",
                Metadata = metadata
            });
        }

        foreach (var membership in memberships)
        {
            var metadata = JsonSerializer.Serialize(new
            {
                href = "/profile",
                expiresAt = membership.MembershipExpiresAt
            });
            if (!existingKeys.Add($"{membership.Id:N}|membership_expiring|{metadata}")) continue;
            db.Notifications.Add(new Notification
            {
                UserId = membership.Id,
                Title = "Thẻ thư viện sắp hết hạn",
                Message = $"Thẻ thư viện của bạn sẽ hết hạn vào {membership.MembershipExpiresAt:dd/MM/yyyy}.",
                Type = "membership_expiring",
                Metadata = metadata
            });
        }

        if (db.ChangeTracker.Entries<Notification>().Any(entry => entry.State == EntityState.Added))
            await db.SaveChangesAsync(ct);
    }
}
