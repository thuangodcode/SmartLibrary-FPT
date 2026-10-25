using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Rag.DTOs;

namespace SmartLibrary.Application.Features.Rag;

public interface IRagReindexJobQueue
{
    Task<Result<RagReindexJobDto>> StartAsync(string role, Guid userId, CancellationToken ct = default);
    Task<Result<RagReindexJobDto>> GetAsync(Guid jobId, Guid userId, CancellationToken ct = default);
}
