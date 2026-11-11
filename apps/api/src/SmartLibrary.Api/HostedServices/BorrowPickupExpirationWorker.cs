using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SmartLibrary.Api.Hubs;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.HostedServices;

public sealed class BorrowPickupExpirationWorker(
    IServiceScopeFactory scopeFactory,
    IHubContext<NotificationHub> hub,
    ILogger<BorrowPickupExpirationWorker> logger,
    IConfiguration configuration) : BackgroundService
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
                if (!configuration.GetValue<bool>("Demo:Isolated"))
                    await SendDueDateEmailRemindersAsync(
                    scope.ServiceProvider.GetRequiredService<AppDbContext>(),
                    scope.ServiceProvider.GetRequiredService<IEmailService>(),
                    stoppingToken);
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

    private static async Task SendDueDateEmailRemindersAsync(AppDbContext db, IEmailService emailService, CancellationToken ct)
    {
        var settings = await db.CirculationReminderSettings.AsNoTracking()
            .OrderBy(item => item.UpdatedAt)
            .FirstOrDefaultAsync(ct);
        if (settings is not { IsEnabled: true }) return;

        var now = DateTime.UtcNow;
        var targetDate = now.Date.AddDays(settings.ReminderDays);
        var targetEnd = targetDate.AddDays(1);
        var dueLoans = await db.BorrowRecords.AsNoTracking()
            .Where(loan => loan.Status == BorrowStatus.Borrowed
                           && loan.DueDate >= targetDate
                           && loan.DueDate < targetEnd
                           && !loan.IsDeleted
                           && !loan.Reader.IsDeleted
                           && loan.Reader.Email != "")
            .Select(loan => new
            {
                loan.Id,
                loan.ReaderId,
                ReaderName = loan.Reader.FullName,
                ReaderEmail = loan.Reader.Email,
                loan.DueDate,
                BookTitle = loan.BookCopy.Book.Title
            })
            .ToListAsync(ct);

        if (dueLoans.Count == 0) return;
        var readerIds = dueLoans.Select(item => item.ReaderId).Distinct().ToList();
        var sentMetadata = await db.Notifications.AsNoTracking()
            .Where(item => item.Type == "due_date_email_reminder" && readerIds.Contains(item.UserId))
            .Select(item => item.Metadata)
            .ToListAsync(ct);
        var sentKeys = sentMetadata
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var loan in dueLoans)
        {
            var metadata = JsonSerializer.Serialize(new { loanId = loan.Id, reminderDays = settings.ReminderDays });
            if (sentKeys.Contains(metadata)) continue;

            var subject = $"Nhắc hạn trả sách sau {settings.ReminderDays} ngày";
            var body = $"<p>Xin chào {System.Net.WebUtility.HtmlEncode(loan.ReaderName)},</p>" +
                       $"<p>Thư viện xin nhắc bạn sách <strong>{System.Net.WebUtility.HtmlEncode(loan.BookTitle)}</strong> " +
                       $"cần được trả vào ngày <strong>{loan.DueDate:dd/MM/yyyy}</strong>.</p>" +
                       "<p>Vui lòng sắp xếp thời gian trả sách đúng hạn. Nếu bạn đã trả sách, xin bỏ qua email này.</p>";
            if (!await emailService.SendEmailAsync(loan.ReaderEmail, subject, body, ct)) continue;

            db.Notifications.Add(new Notification
            {
                UserId = loan.ReaderId,
                Title = "Đã gửi email nhắc hạn trả sách",
                Message = $"Email nhắc trả “{loan.BookTitle}” trước {settings.ReminderDays} ngày đã được gửi.",
                Type = "due_date_email_reminder",
                Metadata = metadata
            });
            sentKeys.Add(metadata);
        }

        if (db.ChangeTracker.Entries<Notification>().Any(entry => entry.State == EntityState.Added))
            await db.SaveChangesAsync(ct);
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
