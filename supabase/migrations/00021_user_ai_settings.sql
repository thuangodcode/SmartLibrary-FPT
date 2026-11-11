-- API Key AI theo từng thủ thư. RLS chặn client đọc trực tiếp. Backend dùng connection string.

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS active_librarian_user_id UUID;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS index_embedding_model VARCHAR(100);

CREATE TABLE IF NOT EXISTS user_ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    encrypted_api_key TEXT,
    api_key_last4 VARCHAR(8),
    provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
    chat_model VARCHAR(100) NOT NULL DEFAULT 'gemini-3.8-flash',
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'gemini-embedding-001',
    base_url VARCHAR(500),
    provider_keys_json TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_tested_at TIMESTAMPTZ,
    last_test_ok BOOLEAN,
    last_test_message VARCHAR(500),
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_ai_settings_user ON user_ai_settings (user_id);

ALTER TABLE user_ai_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE user_ai_settings FROM anon, authenticated;
