using SmartLibrary.Application.Features.Ai.DTOs;

namespace SmartLibrary.Application.Features.Ai;

public interface IAiWorkspaceRepository
{
    Task<AiLibrarianSignals> GetSignalsAsync(int days, CancellationToken ct = default);
}
