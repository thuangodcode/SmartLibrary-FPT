using Microsoft.AspNetCore.Mvc;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("[controller]")]
[ApiExplorerSettings(IgnoreApi = true)]
public class HealthController : ControllerBase
{
    [HttpGet("/api/health")]
    public IActionResult Health()
    {
        return Ok(new
        {
            status = "healthy",
            timestamp = DateTime.UtcNow,
            service = "SmartLibrary.Api"
        });
    }

    [HttpGet("/db-check")]
    public async Task<IActionResult> DbCheck([FromServices] IConfiguration config)
    {
        var connStr = config.GetConnectionString("DefaultConnection");
        var tables = new List<string>();
        var counts = new Dictionary<string, long>();
        try
        {
            await using var conn = new Npgsql.NpgsqlConnection(connStr);
            await conn.OpenAsync();

            await using (var cmd = new Npgsql.NpgsqlCommand(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;", conn))
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    tables.Add(reader.GetString(0));
                }
            }

            foreach (var t in tables)
            {
                try
                {
                    await using var countCmd = new Npgsql.NpgsqlCommand($"SELECT COUNT(*) FROM \"{t}\";", conn);
                    var cnt = await countCmd.ExecuteScalarAsync();
                    counts[t] = Convert.ToInt64(cnt);
                }
                catch { }
            }

            var profilesList = new List<object>();
            await using (var profCmd = new Npgsql.NpgsqlCommand("SELECT id, email, full_name, role_id, status FROM profiles;", conn))
            {
                await using var profReader = await profCmd.ExecuteReaderAsync();
                while (await profReader.ReadAsync())
                {
                    profilesList.Add(new
                    {
                        id = profReader.GetGuid(0),
                        email = profReader.GetString(1),
                        fullName = profReader.GetString(2),
                        roleId = profReader.IsDBNull(3) ? (Guid?)null : profReader.GetGuid(3),
                        status = profReader.GetString(4)
                    });
                }
            }

            return Ok(new { success = true, tables, counts, profiles = profilesList });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, error = ex.Message, stack = ex.StackTrace });
        }
    }

    [HttpPost("/db-seed")]
    public async Task<IActionResult> DbSeed([FromServices] IConfiguration config)
    {
        var connStr = config.GetConnectionString("DefaultConnection");
        try
        {
            await using var conn = new Npgsql.NpgsqlConnection(connStr);
            await conn.OpenAsync();

            var alterSql = @"
                ALTER TABLE identity_documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE identity_documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
            ";
            await using (var aCmd = new Npgsql.NpgsqlCommand(alterSql, conn))
            {
                await aCmd.ExecuteNonQueryAsync();
            }

            // 1. Authors, Categories, Publishers, Majors, Books
            var seedSql = @"
                INSERT INTO authors (id, name, biography) VALUES
                    ('a0000000-0000-0000-0000-000000000001', 'Nguyễn Nhật Ánh', 'Nhà văn nổi tiếng Việt Nam, tác giả của nhiều tác phẩm văn học thiếu nhi.'),
                    ('a0000000-0000-0000-0000-000000000002', 'Robert C. Martin', 'Software engineer and author, known for Clean Code and Clean Architecture.'),
                    ('a0000000-0000-0000-0000-000000000003', 'Martin Fowler', 'Author, software developer, and international public speaker on software development.')
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO categories (id, name, description) VALUES
                    ('c0000000-0000-0000-0000-000000000001', 'Công nghệ thông tin', 'Sách về lập trình, phần mềm, hệ thống'),
                    ('c0000000-0000-0000-0000-000000000002', 'Văn học', 'Tiểu thuyết, truyện ngắn, thơ'),
                    ('c0000000-0000-0000-0000-000000000003', 'Khoa học', 'Sách khoa học tự nhiên và ứng dụng'),
                    ('c0000000-0000-0000-0000-000000000004', 'Kinh tế', 'Sách về kinh tế, quản trị, marketing')
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO publishers (id, name, address) VALUES
                    ('e0000000-0000-0000-0000-000000000001', 'NXB Trẻ', 'TP. Hồ Chí Minh, Việt Nam'),
                    ('e0000000-0000-0000-0000-000000000002', 'Pearson Education', 'London, United Kingdom'),
                    ('e0000000-0000-0000-0000-000000000003', 'Addison-Wesley', 'Boston, MA, USA')
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO majors (id, name, code, description) VALUES
                    ('f0000000-0000-0000-0000-000000000001', 'Kỹ thuật phần mềm', 'SE', 'Software Engineering'),
                    ('f0000000-0000-0000-0000-000000000002', 'Trí tuệ nhân tạo', 'AI', 'Artificial Intelligence'),
                    ('f0000000-0000-0000-0000-000000000003', 'Quản trị kinh doanh', 'BA', 'Business Administration')
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO books (id, title, isbn, description, publisher_id, published_year, language, page_count, total_copies, available_copies) VALUES
                    ('b0000000-0000-0000-0000-000000000001', 'Clean Code: A Handbook of Agile Software Craftsmanship', '9780132350884', 'A guide to writing clean, maintainable code.', 'e0000000-0000-0000-0000-000000000003', 2008, 'en', 464, 5, 3),
                    ('b0000000-0000-0000-0000-000000000002', 'Clean Architecture: A Craftsman''s Guide to Software Structure and Design', '9780134494166', 'Building maintainable software architectures.', 'e0000000-0000-0000-0000-000000000003', 2017, 'en', 432, 3, 2),
                    ('b0000000-0000-0000-0000-000000000003', 'Tôi thấy hoa vàng trên cỏ xanh', '9786041004429', 'Tiểu thuyết nổi tiếng của Nguyễn Nhật Ánh.', 'e0000000-0000-0000-0000-000000000001', 2010, 'vi', 378, 4, 4),
                    ('b0000000-0000-0000-0000-000000000004', 'Refactoring: Improving the Design of Existing Code', '9780134757599', 'A classic guide to code refactoring techniques.', 'e0000000-0000-0000-0000-000000000003', 2018, 'en', 448, 2, 1)
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO book_authors (book_id, author_id) VALUES
                    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
                    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002'),
                    ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001'),
                    ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003')
                ON CONFLICT DO NOTHING;

                INSERT INTO book_categories (book_id, category_id) VALUES
                    ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
                    ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
                    ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002'),
                    ('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001')
                ON CONFLICT DO NOTHING;

                INSERT INTO book_majors (book_id, major_id) VALUES
                    ('b0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001'),
                    ('b0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001'),
                    ('b0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001')
                ON CONFLICT DO NOTHING;
            ";

            await using (var cmd = new Npgsql.NpgsqlCommand(seedSql, conn))
            {
                await cmd.ExecuteNonQueryAsync();
            }

            // 2. Seed reader profiles and registration requests
            var readerRoleId = Guid.Empty;
            await using (var rCmd = new Npgsql.NpgsqlCommand("SELECT id FROM roles WHERE name = 'Reader';", conn))
            {
                var rid = await rCmd.ExecuteScalarAsync();
                if (rid is Guid g) readerRoleId = g;
            }

            var sampleUsers = new[]
            {
                new {
                    Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                    Email = "nguyenvanan@fpt.edu.vn",
                    FullName = "Nguyễn Văn An",
                    Phone = "0901234567",
                    Address = "123 Đường Lê Lợi, Q.1, TP.HCM",
                    Dob = "1998-05-15",
                    DocType = "NationalId",
                    ReqId = Guid.Parse("d1111111-1111-1111-1111-111111111111"),
                    Front = "https://images.unsplash.com/photo-1633409381664-96943f25c786?w=600",
                    Back = "https://images.unsplash.com/photo-1544717305-2782549b5136?w=600",
                    Selfie = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600"
                },
                new {
                    Id = Guid.Parse("22222222-2222-2222-2222-222222222222"),
                    Email = "tranthibinh@fpt.edu.vn",
                    FullName = "Trần Thị Bình",
                    Phone = "0912345678",
                    Address = "456 Đường Nguyễn Huệ, Q.3, TP.HCM",
                    Dob = "2000-11-22",
                    DocType = "StudentCard",
                    ReqId = Guid.Parse("d2222222-2222-2222-2222-222222222222"),
                    Front = "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600",
                    Back = "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600",
                    Selfie = "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600"
                },
                new {
                    Id = Guid.Parse("33333333-3333-3333-3333-333333333333"),
                    Email = "lehoangminh@fpt.edu.vn",
                    FullName = "Lê Hoàng Minh",
                    Phone = "0923456789",
                    Address = "789 Đường Cách Mạng Tháng 8, Q.10, TP.HCM",
                    Dob = "1995-03-10",
                    DocType = "DriverLicense",
                    ReqId = Guid.Parse("d3333333-3333-3333-3333-333333333333"),
                    Front = "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600",
                    Back = "https://images.unsplash.com/photo-1544717305-2782549b5136?w=600",
                    Selfie = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600"
                }
            };

            foreach (var u in sampleUsers)
            {
                // 1. Insert into auth.users (triggers profile creation if trigger exists)
                var authUserSql = @"
                    INSERT INTO auth.users (
                        id, instance_id, email, encrypted_password, email_confirmed_at, 
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
                    )
                    VALUES (
                        @id, '00000000-0000-0000-0000-000000000000', @email, 
                        crypt('Password123!', gen_salt('bf')), NOW(), 
                        '{}'::jsonb, json_build_object('full_name', @fullName)::jsonb, 
                        NOW(), NOW(), 'authenticated', 'authenticated'
                    )
                    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
                ";
                await using (var aCmd = new Npgsql.NpgsqlCommand(authUserSql, conn))
                {
                    aCmd.Parameters.AddWithValue("id", u.Id);
                    aCmd.Parameters.AddWithValue("email", u.Email);
                    aCmd.Parameters.AddWithValue("fullName", u.FullName);
                    await aCmd.ExecuteNonQueryAsync();
                }

                // 2. Ensure profile exists and update details
                var userSql = @"
                    INSERT INTO profiles (id, email, full_name, phone, address, date_of_birth, role_id, status, is_active, is_deleted, created_at, updated_at)
                    VALUES (@id, @email, @fullName, @phone, @address, @dob::date, @roleId, 'PendingApproval'::account_status, true, false, NOW(), NOW())
                    ON CONFLICT (id) DO UPDATE SET 
                        full_name = EXCLUDED.full_name, 
                        phone = EXCLUDED.phone, 
                        address = EXCLUDED.address, 
                        date_of_birth = EXCLUDED.date_of_birth,
                        status = 'PendingApproval'::account_status;
                ";
                await using (var uCmd = new Npgsql.NpgsqlCommand(userSql, conn))
                {
                    uCmd.Parameters.AddWithValue("id", u.Id);
                    uCmd.Parameters.AddWithValue("email", u.Email);
                    uCmd.Parameters.AddWithValue("fullName", u.FullName);
                    uCmd.Parameters.AddWithValue("phone", u.Phone);
                    uCmd.Parameters.AddWithValue("address", u.Address);
                    uCmd.Parameters.AddWithValue("dob", u.Dob);
                    uCmd.Parameters.AddWithValue("roleId", readerRoleId != Guid.Empty ? (object)readerRoleId : DBNull.Value);
                    await uCmd.ExecuteNonQueryAsync();
                }

                // 3. Insert registration request
                var reqSql = @"
                    INSERT INTO registration_requests (id, user_id, document_type, attempt_no, status, submitted_at, created_at, updated_at)
                    VALUES (@reqId, @userId, @docType::document_type, 1, 'Submitted'::registration_request_status, NOW(), NOW(), NOW())
                    ON CONFLICT (id) DO UPDATE SET status = 'Submitted'::registration_request_status;
                ";
                await using (var rCmd = new Npgsql.NpgsqlCommand(reqSql, conn))
                {
                    rCmd.Parameters.AddWithValue("reqId", u.ReqId);
                    rCmd.Parameters.AddWithValue("userId", u.Id);
                    rCmd.Parameters.AddWithValue("docType", u.DocType);
                    await rCmd.ExecuteNonQueryAsync();
                }

                // 4. Documents
                var delDocSql = "DELETE FROM identity_documents WHERE request_id = @reqId;";
                await using (var delCmd = new Npgsql.NpgsqlCommand(delDocSql, conn))
                {
                    delCmd.Parameters.AddWithValue("reqId", u.ReqId);
                    await delCmd.ExecuteNonQueryAsync();
                }

                var docSql = @"
                    INSERT INTO identity_documents (id, request_id, side, storage_path, mime_type, size_bytes, sha256, document_last4, created_at)
                    VALUES 
                        (gen_random_uuid(), @reqId, 'Front'::document_side, @front, 'image/jpeg', 102400, 'hash1', '1234', NOW()),
                        (gen_random_uuid(), @reqId, 'Back'::document_side, @back, 'image/jpeg', 102400, 'hash2', '1234', NOW()),
                        (gen_random_uuid(), @reqId, 'Selfie'::document_side, @selfie, 'image/jpeg', 102400, 'hash3', NULL, NOW());
                ";
                await using (var dCmd = new Npgsql.NpgsqlCommand(docSql, conn))
                {
                    dCmd.Parameters.AddWithValue("reqId", u.ReqId);
                    dCmd.Parameters.AddWithValue("front", u.Front);
                    dCmd.Parameters.AddWithValue("back", u.Back);
                    dCmd.Parameters.AddWithValue("selfie", u.Selfie);
                    await dCmd.ExecuteNonQueryAsync();
                }
            }

            return Ok(new { success = true, message = "Seed executed successfully!" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, error = ex.Message, stack = ex.StackTrace });
        }
    }

    [HttpGet("/fix-db-enums")]
    public async Task<IActionResult> FixDbEnums([FromServices] IConfiguration config)
    {
        var connStr = config.GetConnectionString("DefaultConnection");
        try
        {
            await using var conn = new Npgsql.NpgsqlConnection(connStr);
            await conn.OpenAsync();

            var sql = @"
                DO $$ BEGIN
                    -- registration_request_status
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'text' AND t.typname = 'registration_request_status') THEN
                        CREATE CAST (text AS registration_request_status) WITH INOUT AS IMPLICIT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'registration_request_status' AND t.typname = 'text') THEN
                        CREATE CAST (registration_request_status AS text) WITH INOUT AS IMPLICIT;
                    END IF;

                    -- document_type
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'text' AND t.typname = 'document_type') THEN
                        CREATE CAST (text AS document_type) WITH INOUT AS IMPLICIT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'document_type' AND t.typname = 'text') THEN
                        CREATE CAST (document_type AS text) WITH INOUT AS IMPLICIT;
                    END IF;

                    -- document_side
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'text' AND t.typname = 'document_side') THEN
                        CREATE CAST (text AS document_side) WITH INOUT AS IMPLICIT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'document_side' AND t.typname = 'text') THEN
                        CREATE CAST (document_side AS text) WITH INOUT AS IMPLICIT;
                    END IF;

                    -- account_status
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'text' AND t.typname = 'account_status') THEN
                        CREATE CAST (text AS account_status) WITH INOUT AS IMPLICIT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'account_status' AND t.typname = 'text') THEN
                        CREATE CAST (account_status AS text) WITH INOUT AS IMPLICIT;
                    END IF;

                    -- reader_type
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'text' AND t.typname = 'reader_type') THEN
                        CREATE CAST (text AS reader_type) WITH INOUT AS IMPLICIT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'reader_type' AND t.typname = 'text') THEN
                        CREATE CAST (reader_type AS text) WITH INOUT AS IMPLICIT;
                    END IF;

                    -- borrow_status
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'text' AND t.typname = 'borrow_status') THEN
                        CREATE CAST (text AS borrow_status) WITH INOUT AS IMPLICIT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'borrow_status' AND t.typname = 'text') THEN
                        CREATE CAST (borrow_status AS text) WITH INOUT AS IMPLICIT;
                    END IF;

                    -- reservation_status
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'text' AND t.typname = 'reservation_status') THEN
                        CREATE CAST (text AS reservation_status) WITH INOUT AS IMPLICIT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'reservation_status' AND t.typname = 'text') THEN
                        CREATE CAST (reservation_status AS text) WITH INOUT AS IMPLICIT;
                    END IF;

                    -- fine_status
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'text' AND t.typname = 'fine_status') THEN
                        CREATE CAST (text AS fine_status) WITH INOUT AS IMPLICIT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'fine_status' AND t.typname = 'text') THEN
                        CREATE CAST (fine_status AS text) WITH INOUT AS IMPLICIT;
                    END IF;

                    -- book_condition
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'text' AND t.typname = 'book_condition') THEN
                        CREATE CAST (text AS book_condition) WITH INOUT AS IMPLICIT;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM pg_cast c JOIN pg_type s ON c.castsource = s.oid JOIN pg_type t ON c.casttarget = t.oid WHERE s.typname = 'book_condition' AND t.typname = 'text') THEN
                        CREATE CAST (book_condition AS text) WITH INOUT AS IMPLICIT;
                    END IF;
                END $$;
            ";

            await using var cmd = new Npgsql.NpgsqlCommand(sql, conn);
            await cmd.ExecuteNonQueryAsync();

            return Ok(new { success = true, message = "Implicit casts created successfully!" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }
}

