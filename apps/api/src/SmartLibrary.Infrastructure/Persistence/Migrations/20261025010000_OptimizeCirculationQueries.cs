using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261025010000_OptimizeCirculationQueries")]
public sealed class OptimizeCirculationQueries : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE INDEX IF NOT EXISTS idx_borrow_records_status_borrow_date
                ON borrow_records(status, borrow_date DESC)
                WHERE is_deleted = FALSE;

            CREATE INDEX IF NOT EXISTS idx_borrow_records_status_due_date
                ON borrow_records(status, due_date)
                WHERE is_deleted = FALSE;

            CREATE INDEX IF NOT EXISTS idx_borrow_records_reader_borrow_date
                ON borrow_records(reader_id, borrow_date DESC)
                WHERE is_deleted = FALSE;

            CREATE INDEX IF NOT EXISTS idx_fines_status_created_at
                ON fines(status, created_at DESC)
                WHERE is_deleted = FALSE;

            CREATE INDEX IF NOT EXISTS idx_fines_reader_created_at
                ON fines(reader_id, created_at DESC)
                WHERE is_deleted = FALSE;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS idx_borrow_records_status_borrow_date;
            DROP INDEX IF EXISTS idx_borrow_records_status_due_date;
            DROP INDEX IF EXISTS idx_borrow_records_reader_borrow_date;
            DROP INDEX IF EXISTS idx_fines_status_created_at;
            DROP INDEX IF EXISTS idx_fines_reader_created_at;
            """);
    }
}
