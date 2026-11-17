ALTER TABLE public.identity_documents
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
