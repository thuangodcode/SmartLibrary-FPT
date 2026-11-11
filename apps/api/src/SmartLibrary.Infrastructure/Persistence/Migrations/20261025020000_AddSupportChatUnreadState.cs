using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261025020000_AddSupportChatUnreadState")]
public sealed class AddSupportChatUnreadState : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE support_chat_messages
                ADD COLUMN IF NOT EXISTS is_read_by_librarian BOOLEAN NOT NULL DEFAULT FALSE;
            UPDATE support_chat_messages
            SET is_read_by_librarian = TRUE;

            CREATE INDEX IF NOT EXISTS idx_support_chat_messages_reader_unread
                ON support_chat_messages(reader_id, is_read_by_librarian);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS idx_support_chat_messages_reader_unread;
            ALTER TABLE support_chat_messages DROP COLUMN IF EXISTS is_read_by_librarian;
            """);
    }
}
