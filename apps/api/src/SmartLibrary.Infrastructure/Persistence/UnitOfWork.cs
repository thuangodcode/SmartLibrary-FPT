using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Infrastructure.Persistence;

public class UnitOfWork : IUnitOfWork
{
    private readonly AppDbContext _context;

    public UnitOfWork(AppDbContext context)
    {
        _context = context;
    }

    public async Task<int> SaveChangesAsync(CancellationToken ct = default)
        => await _context.SaveChangesAsync(ct);

    public IRepository<T> Repository<T>() where T : SmartLibrary.Domain.Common.BaseEntity
    {
        return new SmartLibrary.Infrastructure.Persistence.Repositories.RepositoryBase<T>(_context);
    }

    public void Dispose()
    {
        _context.Dispose();
        GC.SuppressFinalize(this);
    }
}
