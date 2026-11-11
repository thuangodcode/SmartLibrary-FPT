using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261028120000_AddNewsComments")]
public sealed class AddNewsComments : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS news_comments (
                id UUID PRIMARY KEY,
                news_article_id UUID NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
                author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
                parent_comment_id UUID NULL REFERENCES news_comments(id) ON DELETE CASCADE,
                content VARCHAR(2000) NOT NULL,
                is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_news_comments_article_created
                ON news_comments (news_article_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_news_comments_parent
                ON news_comments (parent_comment_id);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP TABLE IF EXISTS news_comments;");
    }
}
