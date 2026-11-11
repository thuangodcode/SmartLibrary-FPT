using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Ai;

public interface IAiSettingsRepository
{
    Task<AiSetting> GetOrCreateAsync(CancellationToken ct = default);
    Task SaveAsync(AiSetting settings, CancellationToken ct = default);
    Task<UserAiSetting?> GetUserAsync(Guid userId, CancellationToken ct = default);
    Task<UserAiSetting> GetOrCreateUserAsync(Guid userId, CancellationToken ct = default);
    Task SaveUserAsync(UserAiSetting settings, CancellationToken ct = default);
    Task<IReadOnlyList<LibrarianAiAccountRow>> ListLibrarianAccountsAsync(CancellationToken ct = default);
}
