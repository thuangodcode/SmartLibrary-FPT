using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261124000000_AddShelfCategoryAssignments")]
public sealed class AddShelfCategoryAssignments : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS storage_shelf_categories (
                shelf_id UUID NOT NULL REFERENCES storage_shelves(id) ON DELETE CASCADE,
                category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                CONSTRAINT pk_storage_shelf_categories PRIMARY KEY (shelf_id, category_id)
            );
            CREATE INDEX IF NOT EXISTS ix_storage_shelf_categories_category_id
                ON storage_shelf_categories(category_id);
            """);

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("DROP TABLE IF EXISTS storage_shelf_categories;");
}
