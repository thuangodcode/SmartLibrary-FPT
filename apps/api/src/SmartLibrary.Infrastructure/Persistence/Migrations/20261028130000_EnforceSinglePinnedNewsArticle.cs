using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261028130000_EnforceSinglePinnedNewsArticle")]
public sealed class EnforceSinglePinnedNewsArticle : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            WITH ranked_pinned_articles AS (
                SELECT id,
                       ROW_NUMBER() OVER (ORDER BY updated_at DESC, created_at DESC, id DESC) AS position
                FROM news_articles
                WHERE is_pinned = TRUE AND is_published = TRUE
            )
            UPDATE news_articles AS article
            SET is_pinned = FALSE
            FROM ranked_pinned_articles AS ranked
            WHERE article.id = ranked.id AND ranked.position > 1;

            CREATE UNIQUE INDEX IF NOT EXISTS ux_news_articles_single_pinned
                ON news_articles (is_pinned)
                WHERE is_pinned = TRUE AND is_published = TRUE;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP INDEX IF EXISTS ux_news_articles_single_pinned;");
    }
}
