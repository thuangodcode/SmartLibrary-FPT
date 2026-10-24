using SmartLibrary.Application.Features.Rag.DTOs;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Rag;

public interface IRagDocumentRepository
{
    Task<RagDocument?> FindBySourceAsync(string sourceType, Guid sourceId, CancellationToken ct = default);
    Task UpsertAsync(RagDocument document, float[] embedding, CancellationToken ct = default);
    Task DeleteBySourceAsync(string sourceType, Guid sourceId, CancellationToken ct = default);
    Task<IReadOnlyList<RagSearchHit>> SearchAsync(float[] embedding, int limit, CancellationToken ct = default);
    Task<IReadOnlyList<RagSearchHit>> SearchCatalogAsync(string question, int limit, CancellationToken ct = default);
    Task<IReadOnlyList<RagSearchHit>> AttachBookFactsAsync(IReadOnlyList<RagSearchHit> hits, CancellationToken ct = default);
    Task<int> CountAsync(CancellationToken ct = default);
}
