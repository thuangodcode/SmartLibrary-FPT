using SmartLibrary.Application.Features.Users.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Users;

public interface IReaderRepository
{
    Task<(IReadOnlyList<ReaderListItemDto> Items, int TotalCount)> GetPagedAsync(
        string? query,
        AccountStatus? status,
        ReaderType? readerType,
        int page,
        int pageSize,
        CancellationToken ct = default);

    Task<ReaderStatsDto> GetStatsAsync(CancellationToken ct = default);

    Task<ReaderDetailDto?> GetDetailAsync(Guid id, CancellationToken ct = default);

    Task<UserProfile?> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task UpdateAsync(UserProfile profile, CancellationToken ct = default);
}
