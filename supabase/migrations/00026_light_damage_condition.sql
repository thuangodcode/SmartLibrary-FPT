-- Keep physical condition separate from settlement of compensation.
DO $$ BEGIN
    IF to_regtype('book_condition') IS NOT NULL THEN
        ALTER TYPE book_condition ADD VALUE IF NOT EXISTS 'lightdamaged';
    END IF;
END $$;
