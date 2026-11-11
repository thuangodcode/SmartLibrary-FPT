using System.Collections.Concurrent;
using System.Threading.Channels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Features.Rag.DTOs;

namespace SmartLibrary.Infrastructure.Services;

public sealed class RagReindexJobService : BackgroundService, IRagReindexJobQueue
{
    private readonly Channel<ReindexJob> _queue = Channel.CreateUnbounded<ReindexJob>();
    private readonly ConcurrentDictionary<Guid, JobState> _jobs = new();
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<RagReindexJobService> _logger;
    private readonly object _gate = new();
    private Guid? _activeJobId;

    public RagReindexJobService(
        IServiceScopeFactory scopes,
        ILogger<RagReindexJobService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    public Task<Result<RagReindexJobDto>> StartAsync(string role, Guid userId, CancellationToken ct = default)
    {
        lock (_gate)
        {
            if (_activeJobId is Guid activeId
                && _jobs.TryGetValue(activeId, out var active)
                && active.Status is "queued" or "running")
            {
                return Task.FromResult(Result<RagReindexJobDto>.Failure("Đang có một tác vụ đồng bộ RAG chạy."));
            }

            CleanupCompletedJobs();
            var job = new ReindexJob(Guid.NewGuid(), userId, role);
            _jobs[job.Id] = new JobState(job.Id, userId);
            if (!_queue.Writer.TryWrite(job))
            {
                _jobs.TryRemove(job.Id, out _);
                return Task.FromResult(Result<RagReindexJobDto>.Failure("Không thể đưa tác vụ đồng bộ vào hàng đợi."));
            }

            _activeJobId = job.Id;
            lock (_jobs[job.Id])
                return Task.FromResult(Result<RagReindexJobDto>.Success(Snapshot(_jobs[job.Id])));
        }
    }

    public Task<Result<RagReindexJobDto>> GetAsync(Guid jobId, Guid userId, CancellationToken ct = default)
    {
        if (!_jobs.TryGetValue(jobId, out var state) || state.OwnerId != userId)
            return Task.FromResult(Result<RagReindexJobDto>.Failure("Không tìm thấy tác vụ đồng bộ RAG."));

        lock (state)
            return Task.FromResult(Result<RagReindexJobDto>.Success(Snapshot(state)));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            if (!_jobs.TryGetValue(job.Id, out var state))
                continue;

            Update(state, status: "running", message: "Đang chuẩn bị dữ liệu sách và chính sách.");
            try
            {
                using var scope = _scopes.CreateScope();
                var rag = scope.ServiceProvider.GetRequiredService<RagService>();
                var result = await rag.ReindexAsync(
                    job.Role,
                    job.OwnerId,
                    stoppingToken,
                    (completed, total) => Update(
                        state,
                        completedItems: completed,
                        totalItems: total,
                        message: total == 0
                            ? "Đang hoàn tất đồng bộ."
                            : $"Đã xử lý {completed:N0}/{total:N0} tài liệu."));

                if (result.IsSuccess)
                {
                    lock (state)
                    {
                        state.Status = "completed";
                        state.Message = "Đồng bộ RAG hoàn tất.";
                        state.Result = result.Data;
                    }
                }
                else
                    Update(state, status: "failed", message: result.Error ?? "Không đồng bộ được RAG.");
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                Update(state, status: "failed", message: "Máy chủ dừng trước khi tác vụ đồng bộ hoàn tất.");
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Tác vụ đồng bộ RAG {JobId} thất bại.", job.Id);
                Update(state, status: "failed", message: "Không đồng bộ được RAG. Kiểm tra log máy chủ rồi thử lại.");
            }
            finally
            {
                lock (_gate)
                {
                    if (_activeJobId == job.Id)
                        _activeJobId = null;
                }
            }
        }
    }

    private void CleanupCompletedJobs()
    {
        foreach (var item in _jobs)
        {
            lock (item.Value)
            {
                if ((item.Value.Status is "completed" or "failed")
                    && item.Value.CreatedAt < DateTime.UtcNow.AddHours(-1))
                    _jobs.TryRemove(item.Key, out _);
            }
        }
    }

    private static void Update(
        JobState state,
        string? status = null,
        int? completedItems = null,
        int? totalItems = null,
        string? message = null)
    {
        lock (state)
        {
            if (status is not null) state.Status = status;
            if (completedItems.HasValue) state.CompletedItems = completedItems.Value;
            if (totalItems.HasValue) state.TotalItems = totalItems.Value;
            if (message is not null) state.Message = message;
        }
    }

    private static RagReindexJobDto Snapshot(JobState state)
        => new()
        {
            JobId = state.Id,
            Status = state.Status,
            CompletedItems = state.CompletedItems,
            TotalItems = state.TotalItems,
            Message = state.Message,
            Result = state.Result
        };

    private sealed record ReindexJob(Guid Id, Guid OwnerId, string Role);

    private sealed class JobState(Guid id, Guid ownerId)
    {
        public Guid Id { get; } = id;
        public Guid OwnerId { get; } = ownerId;
        public DateTime CreatedAt { get; } = DateTime.UtcNow;
        public string Status { get; set; } = "queued";
        public int CompletedItems { get; set; }
        public int TotalItems { get; set; }
        public string Message { get; set; } = "Đang chờ đồng bộ.";
        public RagReindexResultDto? Result { get; set; }
    }
}
