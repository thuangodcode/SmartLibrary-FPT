# Mobile Librarian — mượn trả, tình trạng bản sao và sự cố

Cập nhật 12/11/2026. Mở rộng phần QR/quét/xếp kệ của đợt 1; không có Admin trên mobile.

Sau lượt QA mới, xem [kết quả rà soát và trạng thái dữ liệu test](librarian-flow-audit.md). Phí quá hạn chỉ chốt khi nhận trả; các tên/ca mẫu bên dưới mô tả lúc seed và đã thay đổi sau khi thực hành. Bộ kiểm thử PostgreSQL hiện là 25 ca.

## Quy tắc đã thống nhất

- Trả tốt, kể cả quá hạn: bản sao về kho, đủ điều kiện xếp kệ. Phí thuộc phiếu/độc giả, không khoá cuốn sách còn dùng được.
- Trả hỏng/mất: cần mô tả, mở hoặc cập nhật hồ sơ chờ xác minh; chưa tính bồi thường và chưa cho xếp kệ.
- Xác minh **hư nhẹ**: lưu `LightDamaged` riêng, có thể xếp kệ/cho mượn ngay dù phí chưa thanh toán. Ghi chú và hồ sơ vẫn được giữ.
- Xác minh **hư nặng**: giữ `Damaged`, không khả dụng, trong kho chờ xử lý. Mất sách giữ `Lost`, không mô tả là có sách vật lý trong kho.
- Đóng phí không tự đổi tình trạng sách. Sau sửa chữa/tìm thấy, thủ thư xác nhận riêng điều kiện sử dụng và ghi kết luận; bản sao về kho chờ xếp.
- Từ chối trách nhiệm sự cố không tự biến sách thành tốt. Muốn phục hồi phải chọn rõ tình trạng, xác nhận đã kiểm tra và ghi lý do. Quá hạn thực tế vẫn được tính theo chính sách.
- Không xác nhận phí hư hỏng khi phiếu vẫn đang mượn: cần ghi nhận trả/thất lạc trước. Một báo cáo từ Reader chưa kết thúc phiếu mượn.

## Mobile

- Hôm nay: số phiếu chờ duyệt, chờ giao, đang mượn, quá hạn, hồ sơ chờ xác minh và bản sao chờ xếp lấy từ API.
- Mượn trả: chọn đúng **phiếu**, không chuyển nhầm sang trạng thái hiện tại của bản sao. Chi tiết gồm người mượn/email, lịch nhận, hạn trả, ghi chú, sự cố và phí của phiếu.
- Tiếp nhận; từ chối/huỷ có lý do; giao sách qua quét/nhập đúng mã rồi xác nhận riêng; gia hạn theo backend.
- Trả sách có ghi chú bắt buộc cho hỏng/mất, gửi cả ID phiếu để chặn thao tác trên phiếu cũ sau khi sách đã được mượn lại.
- Hồ sơ sự cố: xác minh nhẹ/nặng/mất, xem phí theo chính sách trước khi xác nhận, chọn cộng quá hạn, từ chối trách nhiệm, phục hồi bản sao sau kiểm tra.
- Phí trên chi tiết phiếu: xem trạng thái và ghi nhận đã thu tiền mặt sau bước đối chiếu/xác nhận. Backend vẫn kiểm tra trạng thái thanh toán và đối soát.
- Quét lại: tình trạng, nơi giữ/vị trí kệ, lịch sử 20 phiếu và 20 hồ sơ gần nhất cùng ghi chú. Chạm để mở đúng phiếu/hồ sơ.
- Điều hướng chi tiết giữ ngữ cảnh quay lại; tránh chồng nhiều modal native cùng lúc. Có tải lại, lỗi mạng, trạng thái trống và khoá thao tác khi đang ghi.
- Danh sách sự cố hiện hiển thị 50 hồ sơ gần nhất, ghi rõ phạm vi; chưa có phân trang cho kho sự cố lớn. Thao tác web xuất hiện sau làm mới/kéo tải lại hoặc quay lại app, chưa có tự cập nhật realtime riêng cho toàn bộ danh sách thủ thư.

## Backend/web

- Thêm `LightDamaged` ở cuối enum, không đổi giá trị trạng thái cũ.
- Endpoint chi tiết phiếu kèm sự cố/phí; lịch sử bản sao; đọc từng hồ sơ; phục hồi bản sao.
- Trả khoá và tải lại phiếu để chống trả hai lần. Xác minh/từ chối khoá cùng hồ sơ, chống vừa xác nhận vừa từ chối/tính phí trùng.
- Chuyển kệ A→B không cộng số bản sẵn sàng; kệ đầy không lưu một phần. Xếp kệ/nhập lên kệ/cập nhật vị trí nối với hàng chờ đặt trước.
- Sửa truy vấn thông báo bổ sung kệ: dùng JSONB containment, tránh `LIKE` trên JSONB làm lỗi trả sách tốt về kho.
- Chỉnh bản sao chung không được dùng để bỏ qua hồ sơ hỏng/mất đang cần kiểm tra.
- Web nhận ghi chú trả sách, có lựa chọn phục hồi thực tế khi từ chối hồ sơ và thao tác kiểm tra phục hồi sau xử lý.
- Migration EF và Supabase `00026`, `00027`: thêm enum trước, commit, rồi mới đổi các bản cũ đã xác minh hư nhẹ. Không đổi barcode, không biến hồ sơ chưa xác minh thành hư nhẹ. Triển khai backend hỗ trợ enum mới cùng đợt; chưa áp dụng thay đổi này lên Supabase trong phiên làm việc này.

## Database demo local

Theo lựa chọn của Long, Supabase được giữ nguyên. API local dùng PostgreSQL `127.0.0.1:55439`, database **smartlibrary_demo**. Đăng nhập vẫn dùng danh tính Supabase, nhưng catalog/nghiệp vụ được lưu local.

Công cụ `tools/SmartLibrary.Demo` chỉ được ghi vào đúng database loopback có tên trên. Nó đọc Supabase trong transaction `READ ONLY`, lấy catalog/chính sách và danh tính Long/thủ thư cần test. Không sao chép phiếu mượn, phí, sự cố, thanh toán thật. Local không có phí cũ của Long; Supabase không bị xoá phí.

API đọc file **ignored** `apps/api/src/SmartLibrary.Api/appsettings.Local.json` chỉ trong Development. `scripts/dev-api.mjs` chạy Development rõ ràng để khởi động lại bằng npm không vô tình quay về DB dùng chung. File local cần giữ nội dung:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=127.0.0.1;Port=55439;Database=smartlibrary_demo;Username=postgres;Pooling=true"
  },
  "Demo": { "Isolated": true },
  "PayOS": { "ClientId": "", "ApiKey": "", "ChecksumKey": "" }
}
```

Cờ demo được kiểm tra host/tên DB trước khi chạy; không cho dùng cờ này với Supabase. Email nhắc hạn được tắt cho demo, PayOS không cấu hình trong file local. Các phiếu thanh toán mẫu là dữ liệu giả lập local; không có tiền thật được chuyển.

PostgreSQL của phiên này nằm ở `/private/tmp/smartlibrary-code-pg/data`. Nếu đã dừng, bật lại:

```bash
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /private/tmp/smartlibrary-code-pg/data -l /private/tmp/smartlibrary-code-pg/server.log -o '-p 55439 -h 127.0.0.1' start
npm run dev:api:lan
```

Đây là database demo tạm cho phiên làm việc; không dùng nó để lưu dữ liệu cần bảo toàn lâu dài. Công cụ khởi tạo schema từ model EF hiện tại và ghi baseline migration tương ứng, không phải bản dump đầy đủ của Supabase.

## Các ca cho Long test

Tài khoản: **longnhde180230@fpt.edu.vn**. Tìm `DEMO` trong danh sách hoặc nhập nguyên mã ở tab Quét. Trạng thái bên dưới là lúc bàn giao, có thể đổi khi thao tác.

| Mã | Ca test |
|---|---|
| DEMO001-01 | Chờ duyệt: tiếp nhận hoặc từ chối có lý do |
| DEMO002-01 | Đã được giao rồi trả hỏng trong lần kiểm tra Simulator; hồ sơ chờ xác minh, có ghi chú cụ thể |
| DEMO003-01 | Đang mượn, chưa quá hạn: gia hạn hoặc trả tốt/hỏng/mất |
| DEMO004-01 | Đã trả hỏng, chờ đánh giá: “Rách trang 15–18 và bong gáy” |
| DEMO005-01 | Đã xác minh hư nhẹ, phí mẫu đã đóng: có thể xếp kệ, vẫn giữ dấu hư hỏng |
| DEMO006-01 | Đã xác minh hư nặng, phí mẫu đã đóng: vẫn chặn xếp kệ; thử kiểm tra phục hồi |
| DEMO007-01 | Thất lạc đã xử lý phí: thử tìm thấy và xác nhận tình trạng thực tế |
| DEMO008-01 | Trả tốt, chờ xếp kệ |
| DEMO009-01 | Sẵn sàng trên kệ: thử yêu cầu mượn mới từ Reader |
| DEMO010-01 | Nằm trên `Tầng 9 · Kệ FULL`, sức chứa 1/1; thử xếp cuốn khác để thấy kệ đầy |
| DEMO011-01 | Dành riêng cho ca quá hạn, kích hoạt bằng lệnh bên dưới |
| DEMO012-01 | Bản trên kệ dành cho vòng mượn–trả hư hỏng mới |
| DEMO013-01 | Phiếu chờ giao bổ sung sau kiểm thử: nhập sai mã phải bị chặn, nhập đúng rồi xác nhận giao |

Kệ `Tầng 9 · Kệ DEMO` có chỗ trống cho các ca xếp kệ.

Để tạo phiếu **đang quá hạn 3 ngày** cho chính Long:

```bash
npm run demo:overdue
```

Lệnh chỉ dùng `DEMO011-01`, không tạo nếu cuốn đang có phiếu mở. Sau đó làm mới app → Quá hạn → trả tốt → xem phí 3 × mức/ngày → ghi nhận thu tiền mặt giả lập trong local. Trong lúc còn phiếu quá hạn/phí mới chưa đóng, chính sách chặn mượn vẫn hoạt động đúng. Vì vậy không để sẵn ca này khoá các ca duyệt/giao đầu tiên.

`npm run demo:seed` khởi tạo khi database chưa có; khi đã có dữ liệu thì không tự reset/ghi đè tiến độ test.

Danh tính cần cả hồ sơ, vai trò, bảng `permissions` và liên kết `role_permissions`. Bootstrap đã sao chép đủ các bảng quyền từ nguồn READ ONLY và ánh xạ EF đúng tên `permissions`. Nếu dùng DB demo được tạo trước bản sửa này, chạy `npm run demo:repair-auth`: đổi tên bảng local `permission` cũ nếu cần, bổ sung vai trò/quyền/liên kết còn thiếu trong transaction, không reset hồ sơ hoặc nghiệp vụ. Có thể chạy lại an toàn; không thay đổi Supabase.

**Cấu hình hiện tại:** nguồn chính sách đặt hư nhẹ 20.000đ, mất/hư nặng 15.000đ, quá hạn 5.000đ/ngày. Đây là dữ liệu cấu hình được giữ nguyên, không phải mức do mobile đặt. Nên điều chỉnh lại chính sách trên môi trường phù hợp nếu muốn mức hư nặng cao hơn hư nhẹ.

## Bằng chứng kiểm tra

- Unit test API: 249/249.
- PostgreSQL riêng: 14/14 ca đang chạy, gồm 9 vòng đời bản sao, 4 cấp mã sách và 1 kiểm tra đọc hồ sơ đăng nhập Reader/Librarian với quyền đúng vai trò từ schema EF mới. Schema test tự tạo/xoá trong `smartlibrary_test_codes`, không dùng DB demo/Supabase.
- Các ca: hư nhẹ xếp kệ trước thanh toán, chuyển kệ không tăng tồn, đánh thức đặt trước, hư nặng đóng phí vẫn chặn, phục hồi có ghi chú, trả đồng thời, xác nhận/từ chối đồng thời, quá hạn trả tốt phát sinh đúng phí, kệ đầy, đối chiếu mã giao sách và native enum migration.
- Mobile typecheck, web lint/build và `git diff --check` đã qua. Web build còn cảnh báo bundle lớn có sẵn.
- Simulator: đã thử sai/đúng mã giao, xác nhận giao thành công, chuyển sang trả hư hỏng, chặn khi thiếu ghi chú, lưu ghi chú và mở đúng hồ sơ mới.
- Chưa kiểm tra camera QR trên điện thoại thật. Simulator kiểm tra bằng nhập mã. Chưa khẳng định toàn bộ web/mobile đã E2E trên mọi nhánh; các nhánh còn lại có fixture để test tiếp.
