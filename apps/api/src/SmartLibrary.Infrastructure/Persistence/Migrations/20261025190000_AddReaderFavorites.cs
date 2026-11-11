using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261025190000_AddReaderFavorites")]
public sealed class AddReaderFavorites : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS reader_favorites (
                reader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (reader_id, book_id)
            );

            CREATE INDEX IF NOT EXISTS idx_reader_favorites_reader_created
                ON reader_favorites (reader_id, created_at DESC);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP TABLE IF EXISTS reader_favorites;");
    }
}
