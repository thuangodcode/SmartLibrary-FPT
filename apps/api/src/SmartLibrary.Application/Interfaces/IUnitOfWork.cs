namespace SmartLibrary.Application.Interfaces;

/// <summary>
/// Unit of Work interface for transactional operations.
/// </summary>
public interface IUnitOfWork : IDisposable
{
    Task<int> SaveChangesAsync(CancellationToken ct = default);
    IRepository<T> Repository<T>() where T : SmartLibrary.Domain.Common.BaseEntity;
}
