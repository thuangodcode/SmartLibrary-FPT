using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261024000000_AddSixDigitBookCopyCodes")]
public sealed class AddSixDigitBookCopyCodes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$
            DECLARE
                copy_count BIGINT;
            BEGIN
                SELECT COUNT(*) INTO copy_count FROM book_copies;
                IF copy_count > 999999 THEN
                    RAISE EXCEPTION 'Cannot assign unique six-digit IDs: book_copies contains more than 999999 rows.';
                END IF;
            END $$;

            WITH numbered_copies AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS copy_number
                FROM book_copies
            )
            UPDATE book_copies AS copies
            SET barcode = LPAD(numbered_copies.copy_number::TEXT, 6, '0')
            FROM numbered_copies
            WHERE copies.id = numbered_copies.id;

            CREATE SEQUENCE IF NOT EXISTS book_copy_number_seq
                AS INTEGER
                MINVALUE 1
                MAXVALUE 999999
                START WITH 1
                INCREMENT BY 1
                NO CYCLE;

            SELECT SETVAL(
                'book_copy_number_seq',
                GREATEST(COUNT(*), 1),
                COUNT(*) > 0
            )
            FROM book_copies;

            ALTER TABLE book_copies
                ALTER COLUMN barcode TYPE VARCHAR(6),
                ALTER COLUMN barcode SET DEFAULT LPAD(NEXTVAL('book_copy_number_seq')::TEXT, 6, '0');

            DROP INDEX IF EXISTS idx_book_copies_barcode;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_index AS indexes
                    WHERE indexes.indrelid = 'book_copies'::regclass
                      AND indexes.indisunique
                      AND indexes.indnatts = 1
                      AND indexes.indpred IS NULL
                      AND PG_GET_INDEXDEF(indexes.indexrelid) ILIKE '%(barcode)%'
                ) THEN
                    CREATE UNIQUE INDEX ux_book_copies_barcode
                        ON book_copies(barcode);
                END IF;
            END $$;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'ck_book_copies_barcode_six_digits'
                      AND conrelid = 'book_copies'::regclass
                ) THEN
                    ALTER TABLE book_copies
                        ADD CONSTRAINT ck_book_copies_barcode_six_digits
                        CHECK (barcode ~ '^[0-9]{6}$');
                END IF;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE book_copies
                ALTER COLUMN barcode DROP DEFAULT,
                ALTER COLUMN barcode TYPE VARCHAR(100);

            ALTER TABLE book_copies
                DROP CONSTRAINT IF EXISTS ck_book_copies_barcode_six_digits;

            DROP INDEX IF EXISTS ux_book_copies_barcode;
            DROP SEQUENCE IF EXISTS book_copy_number_seq;
            """);
    }
}
