using System.Threading.Channels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SmartLibrary.Application.Features.Policies;
using SmartLibrary.Application.Features.Rag;

namespace SmartLibrary.Infrastructure.Services;

public sealed class PolicyRagSyncQueue : BackgroundService, IPolicyRagSyncQueue
{
    private readonly Channel<PolicyRagSyncJob> _queue = Channel.CreateUnbounded<PolicyRagSyncJob>(
        new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PolicyRagSyncQueue> _logger;

    public PolicyRagSyncQueue(IServiceScopeFactory scopeFactory, ILogger<PolicyRagSyncQueue> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void Enqueue(Guid policyId, bool shouldIndex)
    {
        if (!_queue.Writer.TryWrite(new PolicyRagSyncJob(policyId, shouldIndex)))
            _logger.LogWarning("Could not queue RAG sync for policy {PolicyId}.", policyId);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var indexer = scope.ServiceProvider.GetRequiredService<IRagIndexer>();
                if (job.ShouldIndex)
                    await indexer.UpsertPolicyAsync(job.PolicyId, stoppingToken);
                else
                    await indexer.DeleteAsync("policy", job.PolicyId, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Background RAG sync failed for policy {PolicyId}.", job.PolicyId);
            }
        }
    }

    private sealed record PolicyRagSyncJob(Guid PolicyId, bool ShouldIndex);
}
