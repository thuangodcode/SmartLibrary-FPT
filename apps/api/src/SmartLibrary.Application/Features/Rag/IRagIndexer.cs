using SmartLibrary.Application.Features.Rag.DTOs;

namespace SmartLibrary.Application.Features.Rag;

public interface IRagIndexer
{
    Task UpsertBookAsync(Guid bookId, CancellationToken ct = default);
    Task UpsertPolicyAsync(Guid policyId, CancellationToken ct = default);
    Task DeleteAsync(string sourceType, Guid sourceId, CancellationToken ct = default);
    Task<RagReindexResultDto> ReindexAllAsync(CancellationToken ct = default);
}
