CREATE INDEX IF NOT EXISTS idx_reviews_book_created_at
    ON reviews (book_id, created_at DESC)
    WHERE is_deleted = FALSE;
