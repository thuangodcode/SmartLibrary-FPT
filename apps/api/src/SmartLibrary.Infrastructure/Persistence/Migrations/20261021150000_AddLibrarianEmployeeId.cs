using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261021150000_AddLibrarianEmployeeId")]
public sealed class AddLibrarianEmployeeId : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);

            CREATE UNIQUE INDEX IF NOT EXISTS ix_profiles_employee_id_lower
                ON profiles (LOWER(employee_id))
                WHERE employee_id IS NOT NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS ix_profiles_employee_id_lower;

            ALTER TABLE profiles
                DROP COLUMN IF EXISTS employee_id;
            """);
    }
}
