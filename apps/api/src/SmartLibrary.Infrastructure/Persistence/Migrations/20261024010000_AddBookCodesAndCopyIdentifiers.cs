using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261024010000_AddBookCodesAndCopyIdentifiers")]
public sealed class AddBookCodesAndCopyIdentifiers : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE books
                ADD COLUMN IF NOT EXISTS code VARCHAR(32);

            WITH numbered_books AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS book_number
                FROM books
                WHERE code IS NULL OR BTRIM(code) = ''
            )
            UPDATE books
            SET code = 'BK' || LPAD(
                numbered_books.book_number::TEXT,
                GREATEST(6, LENGTH(numbered_books.book_number::TEXT)),
                '0'
            )
            FROM numbered_books
            WHERE books.id = numbered_books.id;

            ALTER TABLE books
                ALTER COLUMN code SET NOT NULL;

            CREATE UNIQUE INDEX IF NOT EXISTS ix_books_code
                ON books(code);
            CREATE UNIQUE INDEX IF NOT EXISTS ux_books_code_case_insensitive
                ON books(LOWER(code));

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'ck_books_code_alphanumeric'
                      AND conrelid = 'books'::regclass
                ) THEN
                    ALTER TABLE books
                        ADD CONSTRAINT ck_books_code_alphanumeric
                        CHECK (code ~ '^[A-Za-z0-9]{1,32}$');
                END IF;
            END $$;

            ALTER TABLE book_copies
                DROP CONSTRAINT IF EXISTS ck_book_copies_barcode_six_digits,
                DROP CONSTRAINT IF EXISTS book_copies_barcode_key,
                ALTER COLUMN barcode DROP DEFAULT,
                ALTER COLUMN barcode TYPE VARCHAR(100);

            DROP INDEX IF EXISTS idx_book_copies_barcode;
            DROP INDEX IF EXISTS ux_book_copies_barcode;
            DROP SEQUENCE IF EXISTS book_copy_number_seq;

            WITH numbered_copies AS (
                SELECT id,
                       book_id,
                       ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at, id) AS copy_number
                FROM book_copies
            )
            UPDATE book_copies AS copies
            SET barcode = books.code || '-' || LPAD(
                numbered_copies.copy_number::TEXT,
                GREATEST(2, LENGTH(numbered_copies.copy_number::TEXT)),
                '0'
            )
            FROM numbered_copies
            INNER JOIN books ON books.id = numbered_copies.book_id
            WHERE copies.id = numbered_copies.id;

            CREATE UNIQUE INDEX ux_book_copies_barcode
                ON book_copies(barcode);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$
            DECLARE
                copy_count BIGINT;
            BEGIN
                SELECT COUNT(*) INTO copy_count FROM book_copies;
                IF copy_count > 999999 THEN
                    RAISE EXCEPTION 'Cannot restore six-digit copy identifiers: book_copies contains more than 999999 rows.';
                END IF;
            END $$;

            DROP INDEX IF EXISTS ux_book_copies_barcode;

            WITH numbered_copies AS (
                SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS copy_number
                FROM book_copies
            )
            UPDATE book_copies AS copies
            SET barcode = LPAD(numbered_copies.copy_number::TEXT, 6, '0')
            FROM numbered_copies
            WHERE copies.id = numbered_copies.id;

            ALTER TABLE book_copies
                ALTER COLUMN barcode TYPE VARCHAR(6);

            CREATE SEQUENCE IF NOT EXISTS book_copy_number_seq
                AS INTEGER
                MINVALUE 1
                MAXVALUE 999999
                START WITH 1
                INCREMENT BY 1
                NO CYCLE;

            ALTER TABLE book_copies
                ALTER COLUMN barcode SET DEFAULT LPAD(NEXTVAL('book_copy_number_seq')::TEXT, 6, '0');

            SELECT SETVAL('book_copy_number_seq', GREATEST(COUNT(*), 1), COUNT(*) > 0)
            FROM book_copies;

            CREATE UNIQUE INDEX IF NOT EXISTS ux_book_copies_barcode
                ON book_copies(barcode);
            ALTER TABLE book_copies
                ADD CONSTRAINT ck_book_copies_barcode_six_digits
                CHECK (barcode ~ '^[0-9]{6}$');

            ALTER TABLE books
                DROP CONSTRAINT IF EXISTS ck_books_code_alphanumeric,
                DROP COLUMN IF EXISTS code;
            DROP INDEX IF EXISTS ux_books_code_case_insensitive;
            DROP INDEX IF EXISTS ix_books_code;
            """);
    }
}
