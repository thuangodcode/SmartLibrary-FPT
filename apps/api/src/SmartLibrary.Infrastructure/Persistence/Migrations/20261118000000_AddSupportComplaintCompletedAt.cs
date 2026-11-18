using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261118000000_AddSupportComplaintCompletedAt")]
public sealed class AddSupportComplaintCompletedAt : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE support_complaints ADD COLUMN completed_at TIMESTAMPTZ NULL;
            UPDATE support_complaints
            SET completed_at = updated_at
            WHERE status = 'Resolved';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE support_complaints DROP COLUMN completed_at;");
    }
}
