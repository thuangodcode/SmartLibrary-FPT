using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261104000000_EnforcePhysicalShelfModel")]
public sealed class EnforcePhysicalShelfModel : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            -- Copies currently checked out are not physically occupying a shelf.
            UPDATE book_copies copy
            SET location = NULL, updated_at = now()
            WHERE EXISTS (
                SELECT 1 FROM borrow_records loan
                WHERE loan.book_copy_id = copy.id
                  AND loan.is_deleted = FALSE
                  AND loan.status::text IN ('pending', 'Pending', 'approved', 'Approved', 'borrowed', 'Borrowed', 'overdue', 'Overdue', '0', '1', '2', '4')
            );

            -- Remove old floor/subject pseudo-shelves. Copies there are moved to
            -- the back room because these locations do not exist in the library.
            UPDATE book_copies
            SET location = NULL, updated_at = now()
            WHERE location IS NOT NULL
              AND location !~ '^Tầng [123] · Kệ [A-J]$';

            UPDATE book_copies
            SET location = NULL, updated_at = now()
            WHERE lower(condition::text) IN ('damaged', 'lost') AND location IS NOT NULL;

            UPDATE storage_shelves
            SET is_deleted = TRUE, updated_at = now()
            WHERE name !~ '^Tầng [123] · Kệ [A-J]$'
              AND is_deleted = FALSE;

            INSERT INTO storage_shelves (id, name, capacity, is_deleted, created_at, updated_at)
            SELECT gen_random_uuid(), floor_name || ' · Kệ ' || shelf_letter, 100, FALSE, now(), now()
            FROM (VALUES ('Tầng 1'), ('Tầng 2'), ('Tầng 3')) AS floors(floor_name)
            CROSS JOIN (VALUES ('A'), ('B'), ('C'), ('D'), ('E'), ('F'), ('G'), ('H'), ('I'), ('J')) AS shelves(shelf_letter)
            WHERE NOT EXISTS (
                SELECT 1 FROM storage_shelves existing
                WHERE existing.name = floor_name || ' · Kệ ' || shelf_letter AND existing.is_deleted = FALSE
            );

            UPDATE books book
            SET available_copies = (
                SELECT COUNT(*)::int FROM book_copies copy
                WHERE copy.book_id = book.id AND copy.is_deleted = FALSE AND copy.is_available = TRUE
                  AND copy.location IS NOT NULL AND lower(copy.condition::text) NOT IN ('damaged', 'lost')
                  AND NOT EXISTS (
                      SELECT 1 FROM borrow_records loan WHERE loan.book_copy_id = copy.id AND loan.is_deleted = FALSE
                        AND loan.status::text IN ('pending', 'Pending', 'approved', 'Approved', 'borrowed', 'Borrowed', 'overdue', 'Overdue', '0', '1', '2', '4')
                  )
            ), updated_at = now();
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Intentionally retain the valid shelf catalog and warehouse locations.
    }
}
