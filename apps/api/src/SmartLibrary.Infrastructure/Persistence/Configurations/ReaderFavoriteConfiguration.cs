using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence.Configurations;

public sealed class ReaderFavoriteConfiguration : IEntityTypeConfiguration<ReaderFavorite>
{
    public void Configure(EntityTypeBuilder<ReaderFavorite> builder)
    {
        builder.ToTable("reader_favorites");
        builder.HasKey(favorite => new { favorite.ReaderId, favorite.BookId });
        builder.Property(favorite => favorite.ReaderId).HasColumnName("reader_id");
        builder.Property(favorite => favorite.BookId).HasColumnName("book_id");
        builder.Property(favorite => favorite.CreatedAt).HasColumnName("created_at");

        builder.HasOne(favorite => favorite.Reader)
            .WithMany()
            .HasForeignKey(favorite => favorite.ReaderId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(favorite => favorite.Book)
            .WithMany()
            .HasForeignKey(favorite => favorite.BookId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
