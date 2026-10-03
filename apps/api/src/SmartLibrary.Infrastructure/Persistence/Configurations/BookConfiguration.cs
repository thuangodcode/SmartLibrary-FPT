using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence.Configurations;

/// <summary>
/// EF Core configuration for the Book entity – example for the team.
/// </summary>
public class BookConfiguration : IEntityTypeConfiguration<Book>
{
    public void Configure(EntityTypeBuilder<Book> builder)
    {
        builder.ToTable("books");

        builder.HasKey(b => b.Id);
        builder.Property(b => b.Id).HasColumnName("id");
        builder.Property(b => b.Title).HasColumnName("title").HasMaxLength(500).IsRequired();
        builder.Property(b => b.Isbn).HasColumnName("isbn").HasMaxLength(20);
        builder.Property(b => b.Description).HasColumnName("description");
        builder.Property(b => b.CoverImageUrl).HasColumnName("cover_image_url");
        builder.Property(b => b.PublisherId).HasColumnName("publisher_id");
        builder.Property(b => b.PublishedYear).HasColumnName("published_year");
        builder.Property(b => b.Language).HasColumnName("language").HasMaxLength(10).HasDefaultValue("vi");
        builder.Property(b => b.PageCount).HasColumnName("page_count");
        builder.Property(b => b.TotalCopies).HasColumnName("total_copies").HasDefaultValue(0);
        builder.Property(b => b.AvailableCopies).HasColumnName("available_copies").HasDefaultValue(0);
        builder.Property(b => b.AverageRating).HasColumnName("average_rating").HasColumnType("decimal(3,2)").HasDefaultValue(0m);
        builder.Property(b => b.IsDeleted).HasColumnName("is_deleted").HasDefaultValue(false);
        builder.Property(b => b.CreatedAt).HasColumnName("created_at");
        builder.Property(b => b.UpdatedAt).HasColumnName("updated_at");

        // Relationships
        builder.HasOne(b => b.Publisher)
            .WithMany(p => p.Books)
            .HasForeignKey(b => b.PublisherId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasMany(b => b.Authors)
            .WithMany(a => a.Books)
            .UsingEntity<Dictionary<string, object>>(
                "book_authors",
                r => r.HasOne<Author>().WithMany().HasForeignKey("author_id"),
                l => l.HasOne<Book>().WithMany().HasForeignKey("book_id"),
                je =>
                {
                    je.ToTable("book_authors");
                    je.HasKey("book_id", "author_id");
                });

        builder.HasMany(b => b.Categories)
            .WithMany(c => c.Books)
            .UsingEntity<Dictionary<string, object>>(
                "book_categories",
                r => r.HasOne<Category>().WithMany().HasForeignKey("category_id"),
                l => l.HasOne<Book>().WithMany().HasForeignKey("book_id"),
                je =>
                {
                    je.ToTable("book_categories");
                    je.HasKey("book_id", "category_id");
                });

        builder.HasMany(b => b.Majors)
            .WithMany(m => m.Books)
            .UsingEntity<Dictionary<string, object>>(
                "book_majors",
                r => r.HasOne<Major>().WithMany().HasForeignKey("major_id"),
                l => l.HasOne<Book>().WithMany().HasForeignKey("book_id"),
                je =>
                {
                    je.ToTable("book_majors");
                    je.HasKey("book_id", "major_id");
                });

        builder.HasMany(b => b.Copies)
            .WithOne(c => c.Book)
            .HasForeignKey(c => c.BookId)
            .OnDelete(DeleteBehavior.Cascade);

        // Indexes
        builder.HasIndex(b => b.Isbn).IsUnique();
        builder.HasIndex(b => b.IsDeleted);
    }
}
