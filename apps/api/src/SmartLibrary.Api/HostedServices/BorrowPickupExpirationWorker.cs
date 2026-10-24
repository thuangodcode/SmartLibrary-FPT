using Microsoft.AspNetCore.SignalR;
using SmartLibrary.Api.Hubs;
using SmartLibrary.Application.Features.Circulation;

namespace SmartLibrary.Api.HostedServices;

public sealed class BorrowPickupExpirationWorker(
    IServiceScopeFactory scopeFactory,
    IHubContext<SupportChatHub> hub,
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
                var expired = await circulation.ExpireUncollectedPickupsAsync(stoppingToken);
                foreach (var loan in expired)
                {
                    await hub.Clients.Group(SupportChatHub.ReaderGroup(loan.ReaderId))
                        .SendAsync("BorrowStatusUpdated", loan, stoppingToken);
                    await hub.Clients.Group(SupportChatHub.LibrarianGroup)
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
}
