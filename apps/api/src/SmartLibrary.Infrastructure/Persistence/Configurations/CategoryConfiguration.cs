using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence.Configurations;

public class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.Property(category => category.Code).HasMaxLength(16).IsRequired();
        builder.HasIndex(category => category.Code).IsUnique();
    }
}
