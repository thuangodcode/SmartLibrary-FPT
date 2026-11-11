using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261024120000_AddAiProvidersAndServiceFlags")]
public sealed class AddAiProvidersAndServiceFlags : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS base_url VARCHAR(500);
            ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS provider_keys_json TEXT;
            ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS recommend_enabled BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS trends_enabled BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS overdue_predict_enabled BOOLEAN NOT NULL DEFAULT FALSE;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE ai_settings DROP COLUMN IF EXISTS base_url;
            ALTER TABLE ai_settings DROP COLUMN IF EXISTS provider_keys_json;
            ALTER TABLE ai_settings DROP COLUMN IF EXISTS recommend_enabled;
            ALTER TABLE ai_settings DROP COLUMN IF EXISTS trends_enabled;
            ALTER TABLE ai_settings DROP COLUMN IF EXISTS overdue_predict_enabled;
            """);
    }
}
