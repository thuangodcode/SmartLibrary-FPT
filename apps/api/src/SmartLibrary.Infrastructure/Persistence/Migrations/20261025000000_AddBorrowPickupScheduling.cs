using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261025000000_AddBorrowPickupScheduling")]
public sealed class AddBorrowPickupScheduling : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE borrow_records
                ADD COLUMN IF NOT EXISTS pickup_at TIMESTAMPTZ NULL,
                ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL;

            CREATE INDEX IF NOT EXISTS idx_borrow_records_pickup_slot_status
                ON borrow_records(pickup_at, status)
                WHERE is_deleted = FALSE;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS idx_borrow_records_pickup_slot_status;
            ALTER TABLE borrow_records
                DROP COLUMN IF EXISTS accepted_at,
                DROP COLUMN IF EXISTS pickup_at;
            """);
    }
}
