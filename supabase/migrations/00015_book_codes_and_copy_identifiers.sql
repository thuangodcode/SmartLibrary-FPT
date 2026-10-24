ALTER TABLE books
    ADD COLUMN IF NOT EXISTS code VARCHAR(32);

WITH numbered_books AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS book_number
    FROM books
    WHERE code IS NULL OR BTRIM(code) = ''
)
UPDATE books
SET code = 'BK' || LPAD(numbered_books.book_number::TEXT, 6, '0')
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
SET barcode = books.code || '-' || LPAD(numbered_copies.copy_number::TEXT, 2, '0')
FROM numbered_copies
INNER JOIN books ON books.id = numbered_copies.book_id
WHERE copies.id = numbered_copies.id;

CREATE UNIQUE INDEX ux_book_copies_barcode
    ON book_copies(barcode);
