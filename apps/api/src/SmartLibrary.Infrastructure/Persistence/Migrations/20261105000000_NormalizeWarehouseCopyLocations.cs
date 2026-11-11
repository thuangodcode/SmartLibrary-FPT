using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261105000000_NormalizeWarehouseCopyLocations")]
public sealed class NormalizeWarehouseCopyLocations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            -- The transfer screen previously stored its empty “warehouse” option
            -- as an empty string. All warehouse queries use NULL as the canonical
            -- location, so normalize those existing rows and repair book counts.
            UPDATE book_copies
            SET location = NULL, updated_at = now()
            WHERE location IS NOT NULL AND btrim(location) = '';

            UPDATE books book
            SET available_copies = (
                SELECT COUNT(*)::int
                FROM book_copies copy
                WHERE copy.book_id = book.id
                  AND copy.is_deleted = FALSE
                  AND copy.is_available = TRUE
                  AND copy.location IS NOT NULL
                  AND lower(copy.condition::text) NOT IN ('damaged', 'lost')
                  AND NOT EXISTS (
                      SELECT 1
                      FROM borrow_records loan
                      WHERE loan.book_copy_id = copy.id
                        AND loan.is_deleted = FALSE
                        AND loan.status::text IN ('pending', 'Pending', 'approved', 'Approved', 'borrowed', 'Borrowed', 'overdue', 'Overdue', '0', '1', '2', '4')
                  )
            ), updated_at = now();
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Warehouse copies must remain NULL; converting them back to empty strings
        // would reintroduce the inventory visibility bug.
    }
}
