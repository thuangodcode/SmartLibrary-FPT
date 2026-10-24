using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261024100000_AddReaderSupport")]
public sealed class AddReaderSupport : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE support_request_types (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL UNIQUE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            INSERT INTO support_request_types (name) VALUES
                ('Cơ sở vật chất'),
                ('Tài liệu và sách'),
                ('Dịch vụ thư viện'),
                ('Góp ý khác');

            CREATE TABLE support_complaints (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                reader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
                request_type_id UUID NOT NULL REFERENCES support_request_types(id) ON DELETE RESTRICT,
                content VARCHAR(5000) NOT NULL,
                attachment_url TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'Pending',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX idx_support_complaints_status_created
                ON support_complaints(status, created_at DESC);
            CREATE INDEX idx_support_complaints_reader_created
                ON support_complaints(reader_id, created_at DESC);

            CREATE TABLE support_complaint_replies (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                complaint_id UUID NOT NULL REFERENCES support_complaints(id) ON DELETE CASCADE,
                sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
                message VARCHAR(3000) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX idx_support_complaint_replies_complaint_created
                ON support_complaint_replies(complaint_id, created_at);

            CREATE TABLE support_chat_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                reader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
                sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
                message VARCHAR(2000) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX idx_support_chat_messages_reader_created
                ON support_chat_messages(reader_id, created_at);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE support_chat_messages;
            DROP TABLE support_complaint_replies;
            DROP TABLE support_complaints;
            DROP TABLE support_request_types;
            """);
    }
}
