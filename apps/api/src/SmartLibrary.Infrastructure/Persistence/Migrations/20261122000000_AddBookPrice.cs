using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261122000000_AddBookPrice")]
public sealed class AddBookPrice : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("ALTER TABLE public.books ADD COLUMN IF NOT EXISTS price NUMERIC(18,2) NULL;");

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("ALTER TABLE books DROP COLUMN IF EXISTS price;");
}
