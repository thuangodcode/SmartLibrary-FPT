using Microsoft.EntityFrameworkCore;
using SmartLibrary.Domain.Common;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence.Configurations;

namespace SmartLibrary.Infrastructure.Persistence;

/// <summary>
/// Application database context using EF Core.
/// </summary>
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Book> Books => Set<Book>();
    public DbSet<BookCopy> BookCopies => Set<BookCopy>();
    public DbSet<Author> Authors => Set<Author>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Publisher> Publishers => Set<Publisher>();
    public DbSet<Major> Majors => Set<Major>();
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<BorrowRecord> BorrowRecords => Set<BorrowRecord>();
    public DbSet<Reservation> Reservations => Set<Reservation>();
    public DbSet<Fine> Fines => Set<Fine>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<BookEmbedding> BookEmbeddings => Set<BookEmbedding>();
    public DbSet<ReadingPreference> ReadingPreferences => Set<ReadingPreference>();
    public DbSet<RegistrationRequest> RegistrationRequests => Set<RegistrationRequest>();
    public DbSet<IdentityDocument> IdentityDocuments => Set<IdentityDocument>();
    public DbSet<UserImportBatch> UserImportBatches => Set<UserImportBatch>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Apply all configurations from this assembly
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        modelBuilder.Entity<RolePermission>(entity =>
        {
            entity.ToTable("role_permissions");
            entity.HasKey(rp => new { rp.RoleId, rp.PermissionId });
            entity.HasOne(rp => rp.Role).WithMany(r => r.RolePermissions).HasForeignKey(rp => rp.RoleId);
            entity.HasOne(rp => rp.Permission).WithMany(p => p.RolePermissions).HasForeignKey(rp => rp.PermissionId);
        });

        modelBuilder.Entity<UserProfile>(entity =>
        {
            entity.ToTable("profiles");
            entity.Property(u => u.Status).HasConversion<string>();
            entity.Property(u => u.ReaderType).HasConversion<string>();
        });

        modelBuilder.Entity<RegistrationRequest>(entity =>
        {
            entity.ToTable("registration_requests");
            entity.Property(r => r.DocumentType).HasConversion<string>();
            entity.Property(r => r.Status).HasConversion<string>();
            entity.Property(r => r.ReviewedById).HasColumnName("reviewed_by");
            entity.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId);
            entity.HasOne(r => r.ReviewedBy).WithMany().HasForeignKey(r => r.ReviewedById);
        });

        modelBuilder.Entity<IdentityDocument>(entity =>
        {
            entity.ToTable("identity_documents");
            entity.Property(d => d.Side).HasConversion<string>();
            entity.Ignore(d => d.UpdatedAt);
            entity.Ignore(d => d.IsDeleted);
        });

        modelBuilder.Entity<BorrowRecord>(entity =>
        {
            entity.ToTable("borrow_records");
            entity.Property(b => b.Status).HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<BorrowStatus>(v, true)
            );
        });

        modelBuilder.Entity<Fine>(entity =>
        {
            entity.ToTable("fines");
            entity.Property(f => f.Status).HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<FineStatus>(v, true)
            );
        });

        modelBuilder.Entity<BookCopy>(entity =>
        {
            entity.ToTable("book_copies");
            entity.Property(bc => bc.Condition).HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<BookCondition>(v, true)
            );
        });

        // Global query filter for soft delete
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (typeof(ISoftDeletable).IsAssignableFrom(entityType.ClrType) && entityType.ClrType != typeof(IdentityDocument))
            {
                modelBuilder.Entity(entityType.ClrType)
                    .HasQueryFilter(
                        GenerateSoftDeleteFilter(entityType.ClrType)
                    );
            }
        }
    }

    /// <summary>
    /// Automatically set UpdatedAt on modified entities.
    /// </summary>
    public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        foreach (var entry in ChangeTracker.Entries<AuditableEntity>())
        {
            if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = DateTime.UtcNow;
            }
            else if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = DateTime.UtcNow;
                entry.Entity.UpdatedAt = DateTime.UtcNow;
            }
        }

        return await base.SaveChangesAsync(ct);
    }

    private static System.Linq.Expressions.LambdaExpression GenerateSoftDeleteFilter(Type type)
    {
        var parameter = System.Linq.Expressions.Expression.Parameter(type, "e");
        var property = System.Linq.Expressions.Expression.Property(parameter, nameof(ISoftDeletable.IsDeleted));
        var condition = System.Linq.Expressions.Expression.Equal(property, System.Linq.Expressions.Expression.Constant(false));
        return System.Linq.Expressions.Expression.Lambda(condition, parameter);
    }
}
