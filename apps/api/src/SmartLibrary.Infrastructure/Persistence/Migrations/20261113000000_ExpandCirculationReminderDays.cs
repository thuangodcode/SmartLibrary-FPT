using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261113000000_ExpandCirculationReminderDays")]
public sealed class ExpandCirculationReminderDays : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // This table used to be created by API startup rather than an EF migration.
        // Create it here too so both fresh databases and upgrades have the same contract.
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS circulation_reminder_settings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                reminder_days INTEGER NOT NULL DEFAULT 4,
                updated_by UUID NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE circulation_reminder_settings
                DROP CONSTRAINT IF EXISTS ck_circulation_reminder_days;
            ALTER TABLE circulation_reminder_settings
                ALTER COLUMN reminder_days SET DEFAULT 4;
            ALTER TABLE circulation_reminder_settings
                ADD CONSTRAINT ck_circulation_reminder_days CHECK (reminder_days IN (2, 4, 7, 14));
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Keep the expanded constraint: reverting it would invalidate saved 2/4-day choices.
        migrationBuilder.Sql("ALTER TABLE circulation_reminder_settings ALTER COLUMN reminder_days SET DEFAULT 7;");
    }
}
