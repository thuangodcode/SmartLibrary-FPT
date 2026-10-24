using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261024140000_AddSupportComplaintHandling")]
public sealed class AddSupportComplaintHandling : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE support_complaints
                ADD COLUMN accepted_by_id UUID NULL REFERENCES profiles(id) ON DELETE RESTRICT,
                ADD COLUMN accepted_at TIMESTAMPTZ NULL,
                ADD COLUMN due_at TIMESTAMPTZ NULL,
                ADD COLUMN first_responded_at TIMESTAMPTZ NULL;

            CREATE INDEX idx_support_complaints_accepted_by
                ON support_complaints(accepted_by_id);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX idx_support_complaints_accepted_by;
            ALTER TABLE support_complaints
                DROP COLUMN first_responded_at,
                DROP COLUMN due_at,
                DROP COLUMN accepted_at,
                DROP COLUMN accepted_by_id;
            """);
    }
}
