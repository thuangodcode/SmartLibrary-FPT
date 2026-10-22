using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261022010000_AddCirculationInvariants")]
public sealed class AddCirculationInvariants : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_borrow_records_one_active_copy
            ON borrow_records (book_copy_id)
            WHERE is_deleted = FALSE
            AND status IN ('borrowed', 'overdue', 'approved');

            CREATE UNIQUE INDEX IF NOT EXISTS ux_fines_one_compensation_per_loan
            ON fines (borrow_record_id)
            WHERE is_deleted = FALSE
            AND (
            reason LIKE 'Bồi thường mất sách%'
            OR reason LIKE 'Bồi thường hư hỏng%'
            );

            CREATE UNIQUE INDEX IF NOT EXISTS ux_fines_one_overdue_per_loan
            ON fines (borrow_record_id)
            WHERE is_deleted = FALSE
            AND reason LIKE 'Phạt quá hạn%';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ux_fines_one_overdue_per_loan;
            DROP INDEX IF EXISTS ux_fines_one_compensation_per_loan;
            DROP INDEX IF EXISTS ux_borrow_records_one_active_copy;
            """);
    }
}
