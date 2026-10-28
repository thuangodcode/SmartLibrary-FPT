using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261028140000_AddManagedStorageShelves")]
public sealed class AddManagedStorageShelves : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE storage_shelves (
                id uuid PRIMARY KEY,
                name character varying(255) NOT NULL,
                capacity integer NOT NULL DEFAULT 100,
                is_deleted boolean NOT NULL DEFAULT FALSE,
                created_at timestamp with time zone NOT NULL DEFAULT now(),
                updated_at timestamp with time zone NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX ux_storage_shelves_active_name ON storage_shelves (name) WHERE is_deleted = FALSE;

            INSERT INTO storage_shelves (id, name, capacity, is_deleted, created_at, updated_at)
            SELECT gen_random_uuid(), floor_name || ' · Kệ ' || shelf_letter, 100, FALSE, now(), now()
            FROM (VALUES ('Tầng trệt'), ('Tầng 1'), ('Tầng 2'), ('Tầng 3')) AS floors(floor_name)
            CROSS JOIN (VALUES ('A'), ('B'), ('C'), ('D'), ('E'), ('F'), ('G'), ('H'), ('I'), ('J'), ('K'), ('L')) AS shelves(shelf_letter);

            INSERT INTO storage_shelves (id, name, capacity, is_deleted, created_at, updated_at)
            SELECT gen_random_uuid(), locations.location, 100, FALSE, now(), now()
            FROM (SELECT DISTINCT location FROM book_copies WHERE location IS NOT NULL AND btrim(location) <> '') AS locations
            WHERE NOT EXISTS (SELECT 1 FROM storage_shelves shelf WHERE shelf.name = locations.location AND shelf.is_deleted = FALSE);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("DROP TABLE IF EXISTS storage_shelves;");
}
