using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261024130000_AddLibrarianAiCriteria")]
public sealed class AddLibrarianAiCriteria : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS librarian_criteria_json TEXT;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE ai_settings DROP COLUMN IF EXISTS librarian_criteria_json;
            """);
    }
}
