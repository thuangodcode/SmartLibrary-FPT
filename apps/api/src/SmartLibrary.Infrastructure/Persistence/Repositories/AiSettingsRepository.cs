using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public class AiSettingsRepository : IAiSettingsRepository
{
    public static readonly Guid SingletonId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    private readonly AppDbContext _context;

    public AiSettingsRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<AiSetting> GetOrCreateAsync(CancellationToken ct = default)
    {
        var settings = await _context.AiSettings.FirstOrDefaultAsync(ct);
        if (settings is not null)
            return settings;

        settings = new AiSetting
        {
            Id = SingletonId,
            Provider = "gemini",
            ChatModel = "gemini-3.8-flash",
            EmbeddingModel = "gemini-embedding-001",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _context.AiSettings.Add(settings);
        await _context.SaveChangesAsync(ct);
        return settings;
    }

    public async Task SaveAsync(AiSetting settings, CancellationToken ct = default)
    {
        settings.UpdatedAt = DateTime.UtcNow;
        _context.AiSettings.Update(settings);
        await _context.SaveChangesAsync(ct);
    }

    public Task<UserAiSetting?> GetUserAsync(Guid userId, CancellationToken ct = default)
        => _context.UserAiSettings.FirstOrDefaultAsync(item => item.UserId == userId, ct);

    public async Task<UserAiSetting> GetOrCreateUserAsync(Guid userId, CancellationToken ct = default)
    {
        var settings = await GetUserAsync(userId, ct);
        if (settings is not null)
            return settings;

        settings = new UserAiSetting
        {
            UserId = userId,
            Provider = "gemini",
            ChatModel = "gemini-3.8-flash",
            EmbeddingModel = "gemini-embedding-001",
            IsEnabled = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _context.UserAiSettings.Add(settings);
        await _context.SaveChangesAsync(ct);
        return settings;
    }

    public async Task SaveUserAsync(UserAiSetting settings, CancellationToken ct = default)
    {
        settings.UpdatedAt = DateTime.UtcNow;
        _context.UserAiSettings.Update(settings);
        await _context.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<LibrarianAiAccountRow>> ListLibrarianAccountsAsync(CancellationToken ct = default)
    {
        return await (
            from profile in _context.UserProfiles.AsNoTracking()
            join role in _context.Set<Role>().AsNoTracking() on profile.RoleId equals role.Id
            where role.Name == "Librarian" && !profile.IsDeleted
            join setting in _context.UserAiSettings.AsNoTracking() on profile.Id equals setting.UserId into grouped
            from setting in grouped.DefaultIfEmpty()
            orderby profile.FullName
            select new LibrarianAiAccountRow
            {
                UserId = profile.Id,
                FullName = profile.FullName,
                Email = profile.Email,
                HasApiKey = setting != null && setting.EncryptedApiKey != null && setting.EncryptedApiKey != "",
                IsEnabled = setting == null || setting.IsEnabled,
                Provider = setting != null ? setting.Provider : "gemini",
                ChatModel = setting != null ? setting.ChatModel : "",
                EmbeddingModel = setting != null ? setting.EmbeddingModel : "",
                LastTestedAt = setting != null ? setting.LastTestedAt : null,
                LastTestOk = setting != null ? setting.LastTestOk : null,
                LastTestMessage = setting != null ? setting.LastTestMessage : null,
                LastUsedAt = setting != null ? setting.LastUsedAt : null
            }).ToListAsync(ct);
    }
}
