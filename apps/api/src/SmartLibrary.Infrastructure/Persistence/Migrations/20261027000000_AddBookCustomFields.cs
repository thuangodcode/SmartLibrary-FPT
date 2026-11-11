using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261027000000_AddBookCustomFields")]
public sealed class AddBookCustomFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE books ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;");
        migrationBuilder.Sql("CREATE TABLE IF NOT EXISTS book_field_configurations (id INTEGER PRIMARY KEY, fields jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE books DROP COLUMN IF EXISTS custom_fields;");
        migrationBuilder.Sql("DROP TABLE IF EXISTS book_field_configurations;");
    }
}
