using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261111000000_AddCategoryCodes")]
public sealed class AddCategoryCodes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE categories ADD COLUMN IF NOT EXISTS code varchar(16);
            WITH names AS (
                SELECT id, is_deleted,
                    CASE lower(btrim(name))
                        WHEN 'cntt & phần mềm' THEN 'IT'
                        WHEN 'khoa học xã hội' THEN 'XH'
                        WHEN 'văn hóa và nghệ thuật' THEN 'VNA'
                        WHEN 'khoa học tự nhiên' THEN 'KHTN'
                        WHEN 'ngoại ngữ' THEN 'NN'
                        WHEN 'kinh tế và quản trị' THEN 'KTQT'
                        WHEN 'khoa học' THEN 'KH'
                        WHEN 'văn học' THEN 'VH'
                        ELSE NULL
                    END AS preferred,
                    row_number() OVER (ORDER BY id) AS ordinal
                FROM categories WHERE code IS NULL OR btrim(code) = ''
            ), ranked AS (
                SELECT *, row_number() OVER (PARTITION BY preferred ORDER BY is_deleted, id) AS duplicate
                FROM names
            )
            UPDATE categories category
            SET code = CASE WHEN ranked.preferred IS NOT NULL AND ranked.duplicate = 1 THEN ranked.preferred
                ELSE 'CAT' || translate(ranked.ordinal::text, '0123456789', 'ABCDEFGHIJ') END
            FROM ranked WHERE category.id = ranked.id;
            ALTER TABLE categories ALTER COLUMN code SET NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS ix_categories_code ON categories (code);
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_categories_code') THEN
                    ALTER TABLE categories ADD CONSTRAINT ck_categories_code CHECK (code ~ '^[A-Z]{1,16}$');
                END IF;
            END $$;
            ALTER TABLE books ADD COLUMN IF NOT EXISTS code_category_id uuid;
            -- Preserve every existing book/barcode; only link unambiguous matching categories.
            UPDATE books book SET code_category_id = category.id
            FROM book_categories link JOIN categories category ON category.id = link.category_id
            WHERE link.book_id = book.id AND book.code_category_id IS NULL
              AND upper(substring(book.code FROM '^[A-Za-z]+')) = category.code;
            CREATE INDEX IF NOT EXISTS ix_books_code_category_id ON books (code_category_id);
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_books_categories_code_category_id') THEN
                    ALTER TABLE books ADD CONSTRAINT fk_books_categories_code_category_id
                        FOREIGN KEY (code_category_id) REFERENCES categories(id) ON DELETE RESTRICT;
                END IF;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE books DROP CONSTRAINT IF EXISTS fk_books_categories_code_category_id;
            DROP INDEX IF EXISTS ix_books_code_category_id;
            ALTER TABLE books DROP COLUMN IF EXISTS code_category_id;
            ALTER TABLE categories DROP CONSTRAINT IF EXISTS ck_categories_code;
            DROP INDEX IF EXISTS ix_categories_code;
            ALTER TABLE categories DROP COLUMN IF EXISTS code;
            """);
    }
}
