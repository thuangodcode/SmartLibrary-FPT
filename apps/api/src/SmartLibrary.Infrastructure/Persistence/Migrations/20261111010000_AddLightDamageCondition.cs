using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261111010000_AddLightDamageCondition")]
public sealed class AddLightDamageCondition : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("""
            -- Keep physical condition separate from settlement of compensation.
            DO $$ BEGIN
                IF to_regtype('book_condition') IS NOT NULL THEN
                    ALTER TYPE book_condition ADD VALUE IF NOT EXISTS 'lightdamaged';
                END IF;
            END $$;
            """, suppressTransaction: true);

    // PostgreSQL enum labels cannot be removed safely while records reference them.
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
