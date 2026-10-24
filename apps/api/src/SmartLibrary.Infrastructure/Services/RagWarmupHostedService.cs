using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Rag;

namespace SmartLibrary.Infrastructure.Services;

public sealed class RagWarmupHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<RagWarmupHostedService> _logger;

    public RagWarmupHostedService(IServiceScopeFactory scopes, ILogger<RagWarmupHostedService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
            using var scope = _scopes.CreateScope();
            var documents = scope.ServiceProvider.GetRequiredService<IRagDocumentRepository>();
            var existing = await documents.CountAsync(stoppingToken);
            if (existing > 0)
            {
                _logger.LogInformation("Kho RAG đã có {Count} tài liệu, bỏ qua đồng bộ lúc khởi động.", existing);
                return;
            }

            var settingsService = scope.ServiceProvider.GetRequiredService<AiSettingsService>();
            var credential = await settingsService.ResolveLibraryAsync(stoppingToken);
            if (!credential.IsSuccess)
            {
                _logger.LogWarning("Kho RAG trống nhưng chưa có API Key nên chưa đồng bộ được.");
                return;
            }

            _logger.LogInformation("Kho RAG đang trống. Bắt đầu đồng bộ sách và chính sách.");
            var indexer = scope.ServiceProvider.GetRequiredService<IRagIndexer>();
            var result = await indexer.ReindexAllAsync(stoppingToken);
            await settingsService.UpdateSyncStatsAsync(
                result.SyncedAt, result.DocumentCount, credential.Data!.EmbeddingModel, stoppingToken);
            _logger.LogInformation(
                "Đã đồng bộ RAG: {Books} sách, {Policies} chính sách, {Failed} lỗi, tổng {Count} tài liệu.",
                result.BooksIndexed,
                result.PoliciesIndexed,
                result.Failed,
                result.DocumentCount);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không đồng bộ được kho RAG lúc khởi động. Admin có thể bấm Đồng bộ dữ liệu RAG.");
        }
    }
}
