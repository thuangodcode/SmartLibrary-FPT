-- 00029_add_literature_books.sql
-- Bổ sung 2 đầu sách kinh điển cho danh mục Văn học để đủ 10 đầu sách (2 hàng x 5 cuốn)
DO $$
DECLARE
    v_category_id UUID;
    v_author1_id UUID;
    v_author2_id UUID;
    v_book1_id UUID := gen_random_uuid();
    v_book2_id UUID := gen_random_uuid();
    v_book1_code VARCHAR(32);
    v_book2_code VARCHAR(32);
    v_max_num INT;
BEGIN
    SELECT id INTO v_category_id FROM categories WHERE LOWER(name) = 'văn học' LIMIT 1;
    IF v_category_id IS NULL THEN
        RETURN;
    END IF;

    -- Author 1: Harper Lee
    SELECT id INTO v_author1_id FROM authors WHERE LOWER(name) = 'harper lee' LIMIT 1;
    IF v_author1_id IS NULL THEN
        v_author1_id := gen_random_uuid();
        INSERT INTO authors (id, name, biography)
        VALUES (v_author1_id, 'Harper Lee', 'Nữ nhà văn người Mỹ nổi tiếng với tác phẩm Giết con chim nhại (To Kill a Mockingbird).');
    END IF;

    -- Author 2: F. Scott Fitzgerald
    SELECT id INTO v_author2_id FROM authors WHERE LOWER(name) = 'f. scott fitzgerald' LIMIT 1;
    IF v_author2_id IS NULL THEN
        v_author2_id := gen_random_uuid();
        INSERT INTO authors (id, name, biography)
        VALUES (v_author2_id, 'F. Scott Fitzgerald', 'Nhà văn Mỹ tiêu biểu của Thời đại Jazz thế kỷ 20 với kiệt tác The Great Gatsby.');
    END IF;

    -- Calculate next book code numbers
    SELECT COALESCE(MAX(SUBSTRING(code FROM '[0-9]+')::INT), 100) INTO v_max_num FROM books;

    -- Book 1: To Kill a Mockingbird
    IF NOT EXISTS (SELECT 1 FROM books WHERE isbn = '9780061120084' OR title ILIKE 'To Kill a Mockingbird%') THEN
        v_max_num := v_max_num + 1;
        v_book1_code := 'BK' || LPAD(v_max_num::TEXT, 6, '0');
        INSERT INTO books (id, code, code_category_id, title, isbn, description, published_year, language, page_count, total_copies, available_copies, average_rating)
        VALUES (v_book1_id, v_book1_code, v_category_id, 'To Kill a Mockingbird', '9780061120084', 'Tác phẩm văn học kinh điển về lòng trắc ẩn, công lý và sự trưởng thành tại miền Nam nước Mỹ.', 1960, 'en', 324, 10, 10, 4.8);

        INSERT INTO book_authors (book_id, author_id) VALUES (v_book1_id, v_author1_id);
        INSERT INTO book_categories (book_id, category_id) VALUES (v_book1_id, v_category_id);

        -- Insert 10 copies
        FOR i IN 1..10 LOOP
            INSERT INTO book_copies (id, book_id, barcode, condition, location, is_available)
            VALUES (gen_random_uuid(), v_book1_id, v_book1_code || '-' || LPAD(i::TEXT, 2, '0'), 'good', 'Tầng 2 · Kệ VH', TRUE);
        END LOOP;
    END IF;

    -- Book 2: The Great Gatsby
    IF NOT EXISTS (SELECT 1 FROM books WHERE isbn = '9780743273565' OR title ILIKE 'The Great Gatsby%') THEN
        v_max_num := v_max_num + 1;
        v_book2_code := 'BK' || LPAD(v_max_num::TEXT, 6, '0');
        INSERT INTO books (id, code, code_category_id, title, isbn, description, published_year, language, page_count, total_copies, available_copies, average_rating)
        VALUES (v_book2_id, v_book2_code, v_category_id, 'The Great Gatsby', '9780743273565', 'Kiệt tác văn học khắc họa Giấc mơ Mỹ, sự xa hoa và bi kịch tình yêu thời đại hoàng kim.', 1925, 'en', 180, 10, 10, 4.7);

        INSERT INTO book_authors (book_id, author_id) VALUES (v_book2_id, v_author2_id);
        INSERT INTO book_categories (book_id, category_id) VALUES (v_book2_id, v_category_id);

        -- Insert 10 copies
        FOR i IN 1..10 LOOP
            INSERT INTO book_copies (id, book_id, barcode, condition, location, is_available)
            VALUES (gen_random_uuid(), v_book2_id, v_book2_code || '-' || LPAD(i::TEXT, 2, '0'), 'good', 'Tầng 2 · Kệ VH', TRUE);
        END LOOP;
    END IF;
END $$;
