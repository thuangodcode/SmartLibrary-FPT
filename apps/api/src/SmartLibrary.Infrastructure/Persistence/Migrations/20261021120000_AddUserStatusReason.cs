using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261021120000_AddUserStatusReason")]
public sealed class AddUserStatusReason : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS status_reason VARCHAR(500);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE profiles
                DROP COLUMN IF EXISTS status_reason;
            """);
    }
}
