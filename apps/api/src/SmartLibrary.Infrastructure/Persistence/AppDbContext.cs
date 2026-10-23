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
    public DbSet<PolicyRule> PolicyRules => Set<PolicyRule>();
    public DbSet<PolicyRuleParameter> PolicyRuleParameters => Set<PolicyRuleParameter>();
    public DbSet<PolicyRuleTarget> PolicyRuleTargets => Set<PolicyRuleTarget>();
    public DbSet<PolicyRuleHistory> PolicyRuleHistories => Set<PolicyRuleHistory>();
    public DbSet<ReportTemplate> ReportTemplates => Set<ReportTemplate>();
    public DbSet<LibraryReport> LibraryReports => Set<LibraryReport>();
    public DbSet<ReportReview> ReportReviews => Set<ReportReview>();
    public DbSet<ReportRequest> ReportRequests => Set<ReportRequest>();

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
            entity.Property(u => u.EmployeeId).HasMaxLength(50);
        });

        modelBuilder.Entity<Role>().ToTable("roles");

        modelBuilder.Entity<UserImportBatch>(entity =>
        {
            entity.ToTable("user_import_batches");
            entity.Property(batch => batch.CreatedById).HasColumnName("created_by");
            entity.Property(batch => batch.Errors).HasColumnType("jsonb");
            entity.Ignore(batch => batch.UpdatedAt);
            entity.HasOne(batch => batch.CreatedBy)
                .WithMany()
                .HasForeignKey(batch => batch.CreatedById);
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

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.Property(x => x.Metadata).HasColumnType("jsonb");
        });

        modelBuilder.Entity<BookCopy>(entity =>
        {
            entity.ToTable("book_copies");
            entity.Property(bc => bc.Condition).HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<BookCondition>(v, true)
            );
        });

        modelBuilder.Entity<PolicyRule>(entity =>
        {
            entity.ToTable("policy_rules");
            entity.Property(p => p.Code).HasColumnName("code").HasMaxLength(20).IsRequired();
            entity.HasIndex(p => p.Code).IsUnique();
            entity.Property(p => p.PolicyType).HasConversion<string>();
            entity.Property(p => p.Status).HasConversion<string>();
            entity.HasOne(p => p.CreatedByUser).WithMany().HasForeignKey(p => p.CreatedBy).IsRequired(false);
            entity.HasOne(p => p.UpdatedByUser).WithMany().HasForeignKey(p => p.UpdatedBy).IsRequired(false);
            entity.HasMany(p => p.Parameters).WithOne(x => x.PolicyRule).HasForeignKey(x => x.PolicyRuleId)
                .IsRequired(false).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(p => p.Targets).WithOne(x => x.PolicyRule).HasForeignKey(x => x.PolicyRuleId)
                .IsRequired(false).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(p => p.Histories).WithOne(x => x.PolicyRule).HasForeignKey(x => x.PolicyRuleId)
                .IsRequired(false).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PolicyRuleParameter>(entity =>
        {
            entity.ToTable("policy_rule_parameters");
        });

        modelBuilder.Entity<PolicyRuleTarget>(entity =>
        {
            entity.ToTable("policy_rule_targets");
        });

        modelBuilder.Entity<PolicyRuleHistory>(entity =>
        {
            entity.ToTable("policy_rule_histories");
        });

        modelBuilder.Entity<ReportTemplate>(entity =>
        {
            entity.ToTable("report_templates");
            entity.Property(x => x.Configuration).HasColumnType("jsonb");
            entity.HasIndex(x => x.IsEnabled);
        });

        modelBuilder.Entity<LibraryReport>(entity =>
        {
            entity.ToTable("reports");
            entity.Property(x => x.Snapshot).HasColumnType("jsonb");
            entity.Property(x => x.Status).IsConcurrencyToken();
            entity.Property(x => x.IsApproved).IsConcurrencyToken();
            entity.HasIndex(x => new { x.Status, x.CreatedAt });
            entity.HasIndex(x => x.TemplateId);
            entity.HasIndex(x => x.SubmittedBy);
            entity.HasIndex(x => x.RequestId);
            entity.HasIndex(x => x.Code).IsUnique();
            entity.HasOne(x => x.Template).WithMany(x => x.Reports).HasForeignKey(x => x.TemplateId);
            entity.HasOne(x => x.Submitter).WithMany().HasForeignKey(x => x.SubmittedBy);
            entity.HasOne(x => x.ReportRequest).WithMany(x => x.Reports).HasForeignKey(x => x.RequestId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ReportRequest>(entity =>
        {
            entity.ToTable("report_requests", table =>
                table.HasCheckConstraint("ck_report_requests_period", "period_end > period_start"));
            entity.Property(x => x.Name).HasMaxLength(250);
            entity.Property(x => x.Status).HasMaxLength(20).IsConcurrencyToken();
            entity.HasIndex(x => new { x.LibrarianId, x.Status, x.CreatedAt });
            entity.HasIndex(x => x.TemplateId);
            entity.HasIndex(x => x.ReportId).IsUnique();
            entity.HasOne(x => x.Librarian).WithMany().HasForeignKey(x => x.LibrarianId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Requester).WithMany().HasForeignKey(x => x.RequestedBy).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Template).WithMany().HasForeignKey(x => x.TemplateId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Report).WithMany().HasForeignKey(x => x.ReportId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ReportReview>(entity =>
        {
            entity.ToTable("report_reviews");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(x => x.CreatedAt).HasDefaultValueSql("now()");
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.HasIndex(x => new { x.ReportId, x.CreatedAt });
            entity.HasOne(x => x.Report).WithMany(x => x.Reviews).HasForeignKey(x => x.ReportId);
            entity.HasOne(x => x.Reviewer).WithMany().HasForeignKey(x => x.ReviewerId);
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
