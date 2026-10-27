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
    public DbSet<BookFieldConfiguration> BookFieldConfigurations => Set<BookFieldConfiguration>();
    public DbSet<BookCopy> BookCopies => Set<BookCopy>();
    public DbSet<Author> Authors => Set<Author>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Publisher> Publishers => Set<Publisher>();
    public DbSet<Major> Majors => Set<Major>();
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<BorrowRecord> BorrowRecords => Set<BorrowRecord>();
    public DbSet<Reservation> Reservations => Set<Reservation>();
    public DbSet<Fine> Fines => Set<Fine>();
    public DbSet<FinePayment> FinePayments => Set<FinePayment>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<ReaderFavorite> ReaderFavorites => Set<ReaderFavorite>();
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
    public DbSet<BookIncident> BookIncidents => Set<BookIncident>();
    public DbSet<AiSetting> AiSettings => Set<AiSetting>();
    public DbSet<UserAiSetting> UserAiSettings => Set<UserAiSetting>();
    public DbSet<RagDocument> RagDocuments => Set<RagDocument>();
    public DbSet<SupportRequestType> SupportRequestTypes => Set<SupportRequestType>();
    public DbSet<SupportComplaint> SupportComplaints => Set<SupportComplaint>();
    public DbSet<SupportComplaintReply> SupportComplaintReplies => Set<SupportComplaintReply>();
    public DbSet<SupportChatMessage> SupportChatMessages => Set<SupportChatMessage>();
    public DbSet<NewsArticle> NewsArticles => Set<NewsArticle>();
    public DbSet<NewsComment> NewsComments => Set<NewsComment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Apply all configurations from this assembly
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        modelBuilder.Entity<BookFieldConfiguration>(entity =>
        {
            entity.ToTable("book_field_configurations");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.FieldsJson).HasColumnName("fields").HasColumnType("jsonb").IsRequired();
            entity.Property(item => item.UpdatedAt).HasColumnName("updated_at");
        });

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
            entity.HasIndex(x => new { x.Status, x.BorrowDate })
                .HasDatabaseName("idx_borrow_records_status_borrow_date")
                .HasFilter("is_deleted = FALSE");
            entity.HasIndex(x => new { x.Status, x.DueDate })
                .HasDatabaseName("idx_borrow_records_status_due_date")
                .HasFilter("is_deleted = FALSE");
            entity.HasIndex(x => new { x.ReaderId, x.BorrowDate })
                .HasDatabaseName("idx_borrow_records_reader_borrow_date")
                .HasFilter("is_deleted = FALSE");
            entity.Property(b => b.Status).HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<BorrowStatus>(v, true)
            );
            entity.Property(b => b.ReturnCondition).HasConversion(
                v => v.HasValue ? v.Value.ToString().ToLower() : null,
                v => v == null ? null : Enum.Parse<BookCondition>(v, true)
            );
        });

        modelBuilder.Entity<Fine>(entity =>
        {
            entity.ToTable("fines");
            entity.HasIndex(x => new { x.Status, x.CreatedAt })
                .HasDatabaseName("idx_fines_status_created_at")
                .HasFilter("is_deleted = FALSE");
            entity.HasIndex(x => new { x.ReaderId, x.CreatedAt })
                .HasDatabaseName("idx_fines_reader_created_at")
                .HasFilter("is_deleted = FALSE");
            entity.Property(f => f.Status).HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<FineStatus>(v, true)
            );
            entity.Property(f => f.PaymentMethod).HasMaxLength(20);
            entity.Property(f => f.PaymentReference).HasMaxLength(100);
            entity.HasMany(f => f.Payments).WithOne(p => p.Fine).HasForeignKey(p => p.FineId);
        });

        modelBuilder.Entity<FinePayment>(entity =>
        {
            entity.ToTable("fine_payments");
            entity.Property(payment => payment.Method).HasMaxLength(20);
            entity.Property(payment => payment.Status).HasConversion(
                value => value.ToString().ToLower(),
                value => Enum.Parse<FinePaymentStatus>(value, true));
            entity.Property(payment => payment.PaymentLinkId).HasMaxLength(100);
            entity.Property(payment => payment.ProviderReference).HasMaxLength(100);
            entity.HasIndex(payment => payment.OrderCode)
                .IsUnique()
                .HasFilter("order_code IS NOT NULL");
            entity.HasIndex(payment => payment.FineId)
                .IsUnique()
                .HasFilter("status = 'pending' AND method = 'PayOS'");
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.Property(x => x.Metadata).HasColumnType("jsonb");
        });

        modelBuilder.Entity<BookCopy>(entity =>
        {
            entity.ToTable("book_copies");
            entity.Property(bc => bc.Barcode)
                .HasMaxLength(100)
                .IsRequired();
            entity.HasIndex(bc => bc.Barcode).IsUnique();
            entity.Property(bc => bc.Condition).HasConversion(
                v => v.ToString().ToLower(),
                v => Enum.Parse<BookCondition>(v, true)
            );
        });

        modelBuilder.Entity<Review>(entity =>
        {
            entity.ToTable("reviews");
            entity.HasKey(review => review.Id);
            entity.Property(review => review.Rating).IsRequired();
            entity.Property(review => review.Comment).HasMaxLength(2000);
            entity.Property(review => review.IsDeleted).HasDefaultValue(false);
            entity.HasIndex(review => new { review.BookId, review.ReaderId }).IsUnique();
            entity.HasIndex(review => new { review.BookId, review.CreatedAt });
            entity.HasOne(review => review.Book).WithMany(book => book.Reviews).HasForeignKey(review => review.BookId);
            entity.HasOne(review => review.Reader).WithMany().HasForeignKey(review => review.ReaderId);
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

        modelBuilder.Entity<BookIncident>(entity =>
        {
            entity.ToTable("book_incidents");
            entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20);
            entity.Property(x => x.Severity).HasConversion<string>().HasMaxLength(20);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.ReplacementValue).HasColumnType("decimal(12,2)");
            entity.Property(x => x.AssessedFee).HasColumnType("decimal(12,2)");
            entity.HasIndex(x => x.ReaderId);
            entity.HasIndex(x => x.Status);
            entity.HasOne(x => x.BorrowRecord).WithMany().HasForeignKey(x => x.BorrowRecordId);
            entity.HasOne(x => x.BookCopy).WithMany().HasForeignKey(x => x.BookCopyId);
            entity.HasOne(x => x.Reader).WithMany().HasForeignKey(x => x.ReaderId);
            entity.HasOne(x => x.CompensationFine).WithMany().HasForeignKey(x => x.CompensationFineId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.OverdueFine).WithMany().HasForeignKey(x => x.OverdueFineId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AiSetting>(entity =>
        {
            entity.ToTable("ai_settings");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.EncryptedApiKey).HasColumnName("encrypted_api_key");
            entity.Property(x => x.ApiKeyLast4).HasMaxLength(8);
            entity.Property(x => x.Provider).HasMaxLength(50).IsRequired();
            entity.Property(x => x.ChatModel).HasMaxLength(100).IsRequired();
            entity.Property(x => x.EmbeddingModel).HasMaxLength(100).IsRequired();
            entity.Property(x => x.BaseUrl).HasMaxLength(500);
            entity.Property(x => x.ProviderKeysJson).HasColumnName("provider_keys_json");
            entity.Property(x => x.LibrarianCriteriaJson).HasColumnName("librarian_criteria_json");
            entity.Property(x => x.ReaderSuggestedQuestionsJson).HasColumnName("reader_suggested_questions_json");
            entity.Property(x => x.IndexEmbeddingModel).HasMaxLength(100);
            entity.Property(x => x.LastTestMessage).HasMaxLength(500);
        });

        modelBuilder.Entity<UserAiSetting>(entity =>
        {
            entity.ToTable("user_ai_settings");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.UserId).IsUnique();
            entity.Property(x => x.EncryptedApiKey).HasColumnName("encrypted_api_key");
            entity.Property(x => x.ApiKeyLast4).HasMaxLength(8);
            entity.Property(x => x.Provider).HasMaxLength(50).IsRequired();
            entity.Property(x => x.ChatModel).HasMaxLength(100).IsRequired();
            entity.Property(x => x.EmbeddingModel).HasMaxLength(100).IsRequired();
            entity.Property(x => x.BaseUrl).HasMaxLength(500);
            entity.Property(x => x.ProviderKeysJson).HasColumnName("provider_keys_json");
            entity.Property(x => x.LastTestMessage).HasMaxLength(500);
        });

        modelBuilder.Entity<RagDocument>(entity =>
        {
            entity.ToTable("rag_documents");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.SourceType).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Title).HasMaxLength(500).IsRequired();
            entity.Property(x => x.Content).IsRequired();
            entity.Property(x => x.ContentHash).HasMaxLength(64).IsRequired();
            entity.HasIndex(x => new { x.SourceType, x.SourceId }).IsUnique();
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

        modelBuilder.Entity<SupportRequestType>(entity =>
        {
            entity.ToTable("support_request_types");
            entity.Property(x => x.Name).HasMaxLength(100).IsRequired();
            entity.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<SupportComplaint>(entity =>
        {
            entity.ToTable("support_complaints");
            entity.Property(x => x.Content).HasMaxLength(5000).IsRequired();
            entity.Property(x => x.Status).HasMaxLength(20).IsRequired();
            entity.HasIndex(x => new { x.Status, x.CreatedAt });
            entity.HasIndex(x => new { x.ReaderId, x.CreatedAt });
            entity.HasOne(x => x.Reader).WithMany().HasForeignKey(x => x.ReaderId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.AcceptedBy).WithMany().HasForeignKey(x => x.AcceptedById).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.RequestType).WithMany().HasForeignKey(x => x.RequestTypeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasMany(x => x.Replies).WithOne(x => x.Complaint).HasForeignKey(x => x.ComplaintId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SupportComplaintReply>(entity =>
        {
            entity.ToTable("support_complaint_replies");
            entity.Property(x => x.Message).HasMaxLength(3000).IsRequired();
            entity.HasIndex(x => new { x.ComplaintId, x.CreatedAt });
            entity.HasOne(x => x.Sender).WithMany().HasForeignKey(x => x.SenderId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SupportChatMessage>(entity =>
        {
            entity.ToTable("support_chat_messages");
            entity.Property(x => x.Message).HasMaxLength(2000).IsRequired();
            entity.Property(x => x.IsReadByLibrarian).HasDefaultValue(false);
            entity.Property(x => x.IsReadByReader).HasDefaultValue(false);
            entity.HasIndex(x => new { x.ReaderId, x.CreatedAt });
            entity.HasIndex(x => new { x.ReaderId, x.IsReadByLibrarian });
            entity.HasIndex(x => new { x.ReaderId, x.IsReadByReader });
            entity.HasOne(x => x.Reader).WithMany().HasForeignKey(x => x.ReaderId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Sender).WithMany().HasForeignKey(x => x.SenderId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<NewsArticle>(entity =>
        {
            entity.ToTable("news_articles");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Title).HasMaxLength(300).IsRequired();
            entity.Property(x => x.Category).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Summary).HasMaxLength(1000).IsRequired();
            entity.Property(x => x.AuthorName).HasMaxLength(150);
            entity.HasIndex(x => x.IsPinned)
                .IsUnique()
                .HasFilter("is_pinned = TRUE AND is_published = TRUE");
        });

        modelBuilder.Entity<NewsComment>(entity =>
        {
            entity.ToTable("news_comments");
            entity.HasKey(comment => comment.Id);
            entity.Property(comment => comment.Content).HasMaxLength(2000).IsRequired();
            entity.Property(comment => comment.IsDeleted).HasDefaultValue(false);
            entity.HasIndex(comment => new { comment.NewsArticleId, comment.CreatedAt });
            entity.HasIndex(comment => comment.ParentCommentId);
            entity.HasOne(comment => comment.NewsArticle).WithMany().HasForeignKey(comment => comment.NewsArticleId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(comment => comment.Author).WithMany().HasForeignKey(comment => comment.AuthorId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(comment => comment.ParentComment).WithMany(comment => comment.Replies).HasForeignKey(comment => comment.ParentCommentId).OnDelete(DeleteBehavior.Cascade);
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
