DO $$
BEGIN
    IF to_regclass('public.support_chat_messages') IS NOT NULL THEN
        ALTER TABLE support_chat_messages
            ADD COLUMN IF NOT EXISTS is_read_by_librarian BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE support_chat_messages
            ADD COLUMN IF NOT EXISTS is_read_by_reader BOOLEAN NOT NULL DEFAULT FALSE;

        UPDATE support_chat_messages
        SET is_read_by_librarian = TRUE,
            is_read_by_reader = TRUE;

        CREATE INDEX IF NOT EXISTS idx_support_chat_messages_reader_unread
            ON support_chat_messages(reader_id, is_read_by_librarian);
        CREATE INDEX IF NOT EXISTS idx_support_chat_messages_reader_reader_unread
            ON support_chat_messages(reader_id, is_read_by_reader);
    END IF;
END $$;
