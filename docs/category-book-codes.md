# Mã danh mục → đầu sách → bản sao → QR

Triển khai ngày 11/11/2026.

- Danh mục có `Code` riêng: 1–16 chữ cái A–Z, chuẩn hóa thành chữ hoa, không trùng kể cả danh mục đã xóa mềm. Form tạo và chỉnh sửa danh mục đều có trường này.
- Một đầu sách có thể thuộc nhiều danh mục nhưng chọn một `CodeCategoryId` làm danh mục cấp mã. Nếu chỉ có một danh mục, API có thể tự chọn danh mục đó. Nhiều danh mục phải chỉ định rõ.
- Form tạo sách hiển thị mã chỉ đọc. `GET /api/v1/books/next-code?categoryId=...` cung cấp bản xem trước. Khi lưu, backend bỏ qua mã do client gửi và cấp lại mã chính thức trong transaction.
- Thuật toán chọn số nguyên dương nhỏ nhất chưa dùng, tối thiểu ba chữ số. Có KHTN000…KHTN010 và KHTN012 thì cấp KHTN011. Sách xóa mềm vẫn giữ mã để tránh trùng khi khôi phục. IT và CIT được xét độc lập; không đổi các mã cũ.
- Tạo đồng thời được khóa theo hàng danh mục và tiền tố bằng PostgreSQL transaction/advisory lock. Hai form có thể cùng thấy một mã xem trước; khi lưu thành công sẽ nhận hai mã khác nhau.
- Bản sao vẫn mang dạng `KHTN011-01`, `KHTN011-02`… QR chứa nguyên mã bản sao. Mã đã cấp và QR giữ nguyên khi chỉnh sửa thông tin sách hoặc đổi tiền tố danh mục. Danh mục cấp mã của đầu sách được giữ cố định; các danh mục phân loại khác có thể thay đổi.

## Migration

EF: `20261111000000_AddCategoryCodes`. Supabase SQL: `00025_category_codes.sql`.

Migration bổ sung `categories.code` và `books.code_category_id`, unique index và foreign key. Gán mã cho tám danh mục chuẩn hiện có: IT, XH, VNA, KHTN, NN, KTQT, KH, VH. Các danh mục cũ ngoài danh sách nhận mã CAT… duy nhất để có thể chỉnh sửa lại. Chỉ liên kết danh mục cấp mã cho sách cũ khi tiền tố hiện tại khớp với danh mục đã liên kết; không sửa mã đầu sách hay barcode.

API local đã khởi động lại và áp dụng migration trên database đang cấu hình. Khi triển khai môi trường khác, cần cập nhật backend/migration và web cùng đợt.

## Kiểm tra

- Toàn bộ API unit test: 238/238 qua, gồm lấp chỗ trống, chuẩn hóa tiền tố, bỏ qua mã nhập tay, sinh barcode từ mã tự động và kiểm tra trùng mã danh mục.
- Bốn integration test trên PostgreSQL 17 riêng tại localhost:55439, database `smartlibrary_test_codes`: migration chạy lại an toàn và giữ mã cũ; không tái dùng mã sách xóa mềm; hai yêu cầu đồng thời nhận IT001/IT002; chặn cấp mã ngoài transaction. Không dùng database dự án cho các test này. PostgreSQL tạm được dừng sau khi thử.
- Chạy lại integration test bằng biến `SMARTLIBRARY_TEST_POSTGRES` trỏ tới database kiểm thử có tên bắt đầu bằng `smartlibrary_test_`. Mỗi test tạo và xóa schema riêng. Khi không cấu hình biến, các test này được đánh dấu skipped.
- Web build và lint qua. Đã xem trực tiếp form trên Chrome local: chọn sẵn KHTN và hiện KHTN011 ở ô chỉ đọc; thứ tự danh mục → danh mục cấp mã → mã tự động. Chưa tạo thêm sách/danh mục vào dữ liệu đang dùng chỉ để kiểm tra.
