using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261024100000_AddAiSettingsAndRag")]
public sealed class AddAiSettingsAndRag : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

            CREATE TABLE IF NOT EXISTS ai_settings (
                id UUID PRIMARY KEY,
                encrypted_api_key TEXT,
                api_key_last4 VARCHAR(8),
                provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
                chat_model VARCHAR(100) NOT NULL DEFAULT 'gemini-2.0-flash',
                embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-004',
                is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                reader_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                librarian_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                last_tested_at TIMESTAMPTZ,
                last_test_ok BOOLEAN,
                last_test_message VARCHAR(500),
                documents_synced_at TIMESTAMPTZ,
                document_count INTEGER NOT NULL DEFAULT 0,
                updated_by UUID,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            INSERT INTO ai_settings (id, provider, chat_model, embedding_model)
            VALUES (
                '00000000-0000-0000-0000-000000000001',
                'gemini',
                'gemini-2.0-flash',
                'text-embedding-004'
            )
            ON CONFLICT (id) DO NOTHING;

            CREATE TABLE IF NOT EXISTS rag_documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                source_type VARCHAR(20) NOT NULL,
                source_id UUID NOT NULL,
                title VARCHAR(500) NOT NULL,
                content TEXT NOT NULL,
                content_hash VARCHAR(64) NOT NULL,
                embedding extensions.vector(768),
                indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (source_type, source_id)
            );

            CREATE INDEX IF NOT EXISTS idx_rag_documents_source ON rag_documents (source_type, source_id);

            CREATE INDEX IF NOT EXISTS idx_rag_documents_vector ON rag_documents
                USING hnsw (embedding extensions.vector_cosine_ops)
                WITH (m = 16, ef_construction = 64);

            ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
            ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
            ALTER TABLE book_embeddings ENABLE ROW LEVEL SECURITY;

            REVOKE ALL ON TABLE ai_settings FROM anon, authenticated;
            REVOKE ALL ON TABLE rag_documents FROM anon, authenticated;
            REVOKE ALL ON TABLE book_embeddings FROM anon, authenticated;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS rag_documents;
            DROP TABLE IF EXISTS ai_settings;
            """);
    }
}
