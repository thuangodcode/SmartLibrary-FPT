using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261125000000_AddIdentityDocumentDeletedAt")]
public sealed class AddIdentityDocumentDeletedAt : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("ALTER TABLE identity_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;");

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.Sql("ALTER TABLE identity_documents DROP COLUMN IF EXISTS deleted_at;");
}
