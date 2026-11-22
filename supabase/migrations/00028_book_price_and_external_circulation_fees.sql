ALTER TABLE public.books
    ADD COLUMN IF NOT EXISTS price NUMERIC(18,2) NULL
    CHECK (price IS NULL OR price >= 0);
