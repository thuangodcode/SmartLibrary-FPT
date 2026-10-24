using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261024020000_FixPostgresEnumCastAmbiguity")]
public sealed class FixPostgresEnumCastAmbiguity : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$
            DECLARE
                enum_name TEXT;
            BEGIN
                FOREACH enum_name IN ARRAY ARRAY[
                    'registration_request_status',
                    'document_type',
                    'document_side',
                    'account_status',
                    'reader_type',
                    'borrow_status',
                    'reservation_status',
                    'fine_status',
                    'book_condition'
                ] LOOP
                    IF to_regtype(enum_name) IS NULL THEN
                        CONTINUE;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM pg_cast c
                        JOIN pg_type source_type ON c.castsource = source_type.oid
                        JOIN pg_type target_type ON c.casttarget = target_type.oid
                        WHERE source_type.typname = enum_name
                          AND target_type.typname = 'text'
                    ) THEN
                        EXECUTE format('DROP CAST (%I AS text)', enum_name);
                    END IF;

                    EXECUTE format('CREATE CAST (%I AS text) WITH INOUT AS ASSIGNMENT', enum_name);
                END LOOP;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Keep the unambiguous assignment casts in place when rolling back unrelated migrations.
    }
}
