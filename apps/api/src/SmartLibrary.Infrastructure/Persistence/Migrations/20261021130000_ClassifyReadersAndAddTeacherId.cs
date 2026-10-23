using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace SmartLibrary.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261021130000_ClassifyReadersAndAddTeacherId")]
public sealed class ClassifyReadersAndAddTeacherId : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE profiles
                ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(50);

            UPDATE profiles AS profile
            SET reader_type = 'External'::reader_type
            WHERE EXISTS (
                SELECT 1
                FROM registration_requests AS registration
                WHERE registration.user_id = profile.id
                  AND registration.status::text = 'Approved'
            )
              AND profile.role_id IN (SELECT id FROM roles WHERE name = 'Reader');

            UPDATE profiles AS profile
            SET reader_type = 'Lecturer'::reader_type
            WHERE profile.role_id IN (SELECT id FROM roles WHERE name = 'Reader')
              AND profile.teacher_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM registration_requests AS registration
                  WHERE registration.user_id = profile.id
                    AND registration.status::text = 'Approved'
              );

            UPDATE profiles AS profile
            SET reader_type = 'Student'::reader_type
            WHERE profile.role_id IN (SELECT id FROM roles WHERE name = 'Reader')
              AND profile.reader_type::text IS DISTINCT FROM 'Lecturer'
              AND (
                  profile.student_id IS NOT NULL
                  OR LOWER(profile.email) LIKE '%@fpt.edu.vn'
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM registration_requests AS registration
                  WHERE registration.user_id = profile.id
                    AND registration.status::text = 'Approved'
              )
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE profiles
                DROP COLUMN IF EXISTS teacher_id;
            """);
    }
}
