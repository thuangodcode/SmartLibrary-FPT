-- ============================================================
-- SmartLibrary – Seed Data
-- ============================================================

-- Note: Profiles are created via Supabase Auth, then linked here.
-- This seed assumes auth.users entries already exist or will be created via the app.

-- ── SAMPLE AUTHORS ──────────────────────────────────────────

INSERT INTO authors (id, name, biography) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Nguyễn Nhật Ánh', 'Nhà văn nổi tiếng Việt Nam, tác giả của nhiều tác phẩm văn học thiếu nhi.'),
    ('a0000000-0000-0000-0000-000000000002', 'Robert C. Martin', 'Software engineer and author, known for "Clean Code" and "Clean Architecture".'),
    ('a0000000-0000-0000-0000-000000000003', 'Martin Fowler', 'Author, software developer, and international public speaker on software development.');

-- ── SAMPLE CATEGORIES ───────────────────────────────────────

INSERT INTO categories (id, name, description) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'Công nghệ thông tin', 'Sách về lập trình, phần mềm, hệ thống'),
    ('c0000000-0000-0000-0000-000000000002', 'Văn học', 'Tiểu thuyết, truyện ngắn, thơ'),
    ('c0000000-0000-0000-0000-000000000003', 'Khoa học', 'Sách khoa học tự nhiên và ứng dụng'),
    ('c0000000-0000-0000-0000-000000000004', 'Kinh tế', 'Sách về kinh tế, quản trị, marketing');

-- ── SAMPLE PUBLISHERS ───────────────────────────────────────

INSERT INTO publishers (id, name, address) VALUES
    ('p0000000-0000-0000-0000-000000000001', 'NXB Trẻ', 'TP. Hồ Chí Minh, Việt Nam'),
    ('p0000000-0000-0000-0000-000000000002', 'Pearson Education', 'London, United Kingdom'),
    ('p0000000-0000-0000-0000-000000000003', 'Addison-Wesley', 'Boston, MA, USA');

-- ── SAMPLE MAJORS ───────────────────────────────────────────

INSERT INTO majors (id, name, code, description) VALUES
    ('m0000000-0000-0000-0000-000000000001', 'Kỹ thuật phần mềm', 'SE', 'Software Engineering'),
    ('m0000000-0000-0000-0000-000000000002', 'Trí tuệ nhân tạo', 'AI', 'Artificial Intelligence'),
    ('m0000000-0000-0000-0000-000000000003', 'Quản trị kinh doanh', 'BA', 'Business Administration');

-- ── SAMPLE BOOKS ────────────────────────────────────────────

INSERT INTO books (id, title, isbn, description, publisher_id, published_year, language, page_count, total_copies, available_copies) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Clean Code: A Handbook of Agile Software Craftsmanship', '9780132350884', 'A guide to writing clean, maintainable code.', 'p0000000-0000-0000-0000-000000000003', 2008, 'en', 464, 5, 3),
    ('b0000000-0000-0000-0000-000000000002', 'Clean Architecture: A Craftsman''s Guide to Software Structure and Design', '9780134494166', 'Building maintainable software architectures.', 'p0000000-0000-0000-0000-000000000003', 2017, 'en', 432, 3, 2),
    ('b0000000-0000-0000-0000-000000000003', 'Tôi thấy hoa vàng trên cỏ xanh', '9786041004429', 'Tiểu thuyết nổi tiếng của Nguyễn Nhật Ánh.', 'p0000000-0000-0000-0000-000000000001', 2010, 'vi', 378, 4, 4),
    ('b0000000-0000-0000-0000-000000000004', 'Refactoring: Improving the Design of Existing Code', '9780134757599', 'A classic guide to code refactoring techniques.', 'p0000000-0000-0000-0000-000000000003', 2018, 'en', 448, 2, 1);

-- ── BOOK–AUTHOR LINKS ───────────────────────────────────────

INSERT INTO book_authors (book_id, author_id) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002'),
    ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001'),
    ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003');

-- ── BOOK–CATEGORY LINKS ────────────────────────────────────

INSERT INTO book_categories (book_id, category_id) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
    ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
    ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002'),
    ('b0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001');

-- ── BOOK–MAJOR LINKS ───────────────────────────────────────

INSERT INTO book_majors (book_id, major_id) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'm0000000-0000-0000-0000-000000000001'),
    ('b0000000-0000-0000-0000-000000000002', 'm0000000-0000-0000-0000-000000000001'),
    ('b0000000-0000-0000-0000-000000000004', 'm0000000-0000-0000-0000-000000000001');
