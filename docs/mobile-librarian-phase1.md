# Mobile thủ thư — đợt 1

Ngày triển khai: 11/11/2026. Phạm vi: QR digital, tra cứu đúng bản sao, nhận sách trả và xếp sách trong kho lên kệ. Mobile không có vai trò Admin.

## Điểm vào

- Web: Thủ thư → Bản sao & kệ sách → chọn đầu sách → **Xem QR** tại từng bản sao. QR cũng có ở chi tiết kho và chi tiết sách trên kệ.
- Mobile: **Hôm nay**, **Mượn trả**, **Quét**, **Tài khoản**. Hôm nay có lối vào danh sách sách chờ xếp.
- API mới: `GET /api/v1/copies/lookup?barcode=KHTN002-01`, có quyền `LibrarianOnly`. So khớp toàn bộ mã, không dùng kết quả tìm kiếm gần đúng hay ISBN. Trả thông tin bản sao, phiếu đang mở và các hành động có thể đề xuất.
- Bộ lọc `status=Active` của danh sách phiếu gộp Borrowed và Overdue để khớp tổng số đang mượn.

## Hành vi

QR chứa chính mã bản sao, không chứa dữ liệu độc giả. Quét chỉ tra cứu; mọi thay đổi cần xác nhận riêng. Bản sao đang mượn cho phép xử lý trả; bản sao trong kho, còn tốt, khả dụng và không có phiếu mở cho phép xếp kệ. Pending/Approved không được coi là sách đã giao để trả.

Trả sách dùng API hiện có, cho chọn tình trạng và hiển thị kết quả thật từ backend. Sách tốt trở về kho chờ xếp. Mất/hỏng mở hồ sơ sự cố để xác minh; đợt này chưa có màn xét duyệt sự cố trên mobile. Phí quá hạn do backend tính, không tính lại trong app.

Xếp kệ dùng API điều chuyển hiện có. App hiển thị sức chứa và khóa kệ đã đầy; backend kiểm tra lại tại thời điểm ghi. Sau thành công, app tải lại các danh sách liên quan. Nếu mất kết nối khi ghi, app yêu cầu tải lại trạng thái trước khi thực hiện tiếp để tránh gửi lặp.

Camera chỉ hoạt động khi màn quét đang mở, app ở foreground và người dùng đã cấp quyền. Simulator chuyển sang nhập mã thủ công. Không yêu cầu microphone. Việc xác nhận ghi được khóa trong khi đang gửi.

## Kiểm tra và demo

1. Chạy một API local bằng `npm run dev:api:lan`, web bằng `npm run dev:web`, Metro bằng `npm run dev:mobile`. Khởi động lại API khi backend thay đổi. API startup có thao tác ensure/migration/worker; dùng đúng môi trường đã cấu hình, không khởi động thêm instance chỉ để thử.
2. Web mở **Xem QR** của bản sao test. Điện thoại thật vào **Quét**, cấp quyền camera và đọc QR trên màn hình web. Simulator dùng **Nhập mã** với cùng chuỗi bên dưới QR.
3. Bản sao trong kho → Xếp lên kệ → chọn kệ còn chỗ → xác nhận. Làm mới web để đối chiếu vị trí.
4. Bản sao có phiếu Borrowed/Overdue → Xử lý trả sách → kiểm tra độc giả, hạn trả, tình trạng → xác nhận. Chỉ dùng dữ liệu/tài khoản test đã chuẩn bị cho thao tác ghi.

Các kiểm tra lúc triển khai: mobile typecheck; web build và lint; API solution build; 70 test được chọn thuộc CopyScanRulesTests và CirculationServiceTests đều qua. Đã xem trực tiếp giao diện Hôm nay, nhập mã, bản sao trong kho, chọn kệ (bao gồm kệ đầy), phiếu quá hạn và bước kiểm tra trả trên iPhone 16 Plus Simulator; đã xem hộp QR trên Chrome local. Chưa kiểm tra camera trên điện thoại thật hoặc xác nhận giao dịch ghi qua mobile trên dữ liệu đang dùng.

## Thiết kế

Theo hướng Framed sheet (seed 471506833): khung sáng, nội dung trắng, nút cam theo thương hiệu web, chữ và trạng thái có độ tương phản rõ. Native system font, touch target tối thiểu 44pt, safe area, cuộn tránh bàn phím. Tem QR giữ nền trắng và vùng trống quanh QR. Kiểm tra source theo taste skill: không có FAIL; shadow của dialog nổi và monospace của mã bản sao là hai ngoại lệ có chủ đích. Giao diện React Native được xem trực tiếp trên Simulator; không áp dụng trình đo DOM của web cho native.
