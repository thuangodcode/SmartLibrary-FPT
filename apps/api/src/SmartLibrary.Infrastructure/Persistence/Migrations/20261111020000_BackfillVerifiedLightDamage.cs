using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261111020000_BackfillVerifiedLightDamage")]
public sealed class BackfillVerifiedLightDamage : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("""
            -- Run after 00026 has committed its PostgreSQL enum label.
            -- Repair only the legacy verified-light state. Pending/newer incidents and open loans are left untouched.
                UPDATE book_copies copy SET condition = 'lightdamaged', updated_at = now()
                WHERE copy.is_deleted = FALSE AND copy.condition::text = 'damaged' AND copy.is_available = TRUE
                  AND EXISTS (
                    SELECT 1 FROM book_incidents incident
                    JOIN borrow_records loan ON loan.id = incident.borrow_record_id
                    WHERE incident.book_copy_id = copy.id AND incident.is_deleted = FALSE
                      AND lower(incident.severity::text) = 'light'
                      AND lower(incident.status::text) IN ('compensationpending', 'resolved')
                      AND loan.status::text = 'returned'
                      AND NOT EXISTS (SELECT 1 FROM book_incidents newer WHERE newer.book_copy_id = copy.id
                          AND newer.is_deleted = FALSE AND newer.created_at > incident.created_at)
                  )
                  AND NOT EXISTS (SELECT 1 FROM borrow_records active WHERE active.book_copy_id = copy.id
                      AND active.is_deleted = FALSE AND active.status::text IN ('pending','approved','borrowed','overdue'))
            ;

            UPDATE books book SET available_copies = (
                SELECT count(*) FROM book_copies copy WHERE copy.book_id = book.id AND copy.is_deleted = FALSE
                  AND copy.is_available = TRUE AND copy.location IS NOT NULL
                  AND copy.condition::text NOT IN ('damaged','lost')
            ), updated_at = now() WHERE EXISTS (SELECT 1 FROM book_copies copy WHERE copy.book_id = book.id AND copy.condition::text = 'lightdamaged');
            """);
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
