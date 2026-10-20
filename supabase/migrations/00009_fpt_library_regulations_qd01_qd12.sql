-- Replace QD01-QD08 and add QD09-QD12 from public FPT Library sources.
-- Status stays PendingReview unless Admin already set Active/Inactive.
-- Does not modify CS01-CS06 borrow/fine policies.

INSERT INTO public.policy_rules (
  id, code, name, description, policy_type, status, priority, overrides_general,
  created_at, updated_at, is_deleted
)
VALUES
(
  'a2000000-0000-0000-0000-000000000001',
  'QD01',
  'Thẻ thư viện',
  'Thẻ sinh viên hoặc thẻ nhân viên đồng thời là thẻ thư viện để sử dụng các dịch vụ của thư viện.
Khi giao dịch với thư viện, người dùng phải xuất trình thẻ theo quy định.
Không sử dụng thẻ của người khác và không cho người khác mượn thẻ của mình.',
  'LibraryUse', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000002',
  'QD02',
  'Giờ mở cửa thư viện',
  'Thứ Hai đến Thứ Sáu: 08:15–21:00.
Cuối tuần: 08:00–12:00 và 13:00–17:00.
Theo nguồn tham khảo, buổi tối và cuối tuần chỉ phục vụ chỗ tự học.',
  'OpeningHours', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000003',
  'QD03',
  'Dịch vụ thư viện',
  'Mượn, trả và gia hạn tài liệu.
Hướng dẫn tìm tin và sử dụng thư viện.
Tìm kiếm và tư vấn thông tin.
Truy cập tài nguyên điện tử.
Tiếp nhận đề nghị đặt mua tài liệu.
Mượn liên thư viện.
Sử dụng phòng học nhóm.',
  'LibraryService', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000004',
  'QD04',
  'Quy tắc chung khi sử dụng thư viện',
  'Xuất trình thẻ khi giao dịch; không dùng thẻ của người khác hoặc cho người khác mượn thẻ.
Giữ gìn trật tự, đi nhẹ, nói khẽ.
Giữ vệ sinh chung, bỏ rác đúng nơi quy định; không hút thuốc, không viết hoặc vẽ lên bàn, không ngồi gác chân lên ghế.
Không mang đồ ăn, đồ uống, chất độc hại hoặc chất cháy nổ vào thư viện theo quy định áp dụng.
Tắt chuông điện thoại; không nói chuyện điện thoại trong thư viện.',
  'Conduct', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000005',
  'QD05',
  'Bảo quản tài liệu thư viện',
  'Không viết, vẽ bằng bút chì hoặc bút mực, không dùng bút đánh dấu lên sách.
Không gập, làm nhàu nát hoặc làm rách sách.
Không để sách ẩm ướt, mốc hoặc hư hỏng.
Kiểm tra tình trạng tài liệu trước khi rời quầy thủ thư.
Nếu phát hiện hư hỏng, báo thủ thư để ghi nhận trước khi mang tài liệu ra khỏi thư viện.
Giữ gìn và bảo quản tài liệu trong toàn bộ thời gian mượn.',
  'DocumentCare', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000006',
  'QD06',
  'Quy định mượn tài liệu',
  'Đối tượng đủ điều kiện mượn theo tài liệu: học sinh, sinh viên và cán bộ, giảng viên của Trường Đại học FPT.
Khi mượn, xuất trình thẻ sinh viên hoặc CCCD/VNeID theo quy định nguồn; không dùng ảnh chụp giấy tờ và không sử dụng thẻ của người khác.
Người mượn không được vi phạm nội quy thư viện.
Sách tham khảo: người đọc tự tìm sách và thực hiện thủ tục mượn tại quầy thủ thư.
Sách giáo trình: mượn, nhận tại quầy theo thông báo của thư viện.
Người mượn phải kiểm tra giao dịch và tình trạng tài liệu trước khi rời quầy.',
  'DocumentUse', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000007',
  'QD07',
  'Hạn ngạch mượn và thời hạn mượn',
  'Sinh viên/học sinh: tối đa 10 tài liệu đang mượn cùng lúc.
Cán bộ, giảng viên: tối đa 20 tài liệu đang mượn cùng lúc.
Sách tham khảo tiếng Việt: 7 ngày/tài liệu.
Sách tham khảo ngoại văn hoặc song ngữ: 14 ngày/tài liệu.
Mỗi tài liệu được gia hạn tối đa 4 lượt nếu đủ điều kiện.
Giáo trình: thời hạn theo kỳ học và lịch thông báo của thư viện.
Theo nội dung nội quy khác trong nguồn, giáo trình học tập có thể được gia hạn tối đa một tuần khi có lý do hợp lý.',
  'QuotaInfo', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000008',
  'QD08',
  'Quy định trả tài liệu',
  'Người mượn mang tài liệu đã mượn đến quầy thủ thư để làm thủ tục trả.
Phải trả tài liệu đúng hạn.
Có thể nhờ người khác mang sách đi trả theo quy định nguồn.
Sau khi trả, người đọc cần kiểm tra danh mục mượn trên website để xác nhận trạng thái tài liệu.',
  'ReturnRule', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000009',
  'QD09',
  'Gia hạn tài liệu',
  'Sách tham khảo tiếng Việt có thời hạn mượn theo nguồn là 7 ngày.
Sách tham khảo ngoại văn/song ngữ có thời hạn mượn theo nguồn là 14 ngày.
Mỗi tài liệu có tối đa 4 lượt gia hạn theo nguồn tham khảo.
Giáo trình được xử lý theo lịch học và thông báo riêng của thư viện.',
  'RenewalInfo', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-00000000000a',
  'QD10',
  'Xử lý tài liệu quá hạn',
  'Tài liệu quá hạn: 5.000 VNĐ/tài liệu/ngày, bao gồm ngày nghỉ.
Việc tính phí phải tuân theo chính sách đã được Admin xác nhận và cấu hình trong hệ thống.',
  'Compensation', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-00000000000b',
  'QD11',
  'Mất hoặc hư hỏng tài liệu',
  'Nếu làm mất tài liệu, người mượn phải bồi thường theo giá trị tài liệu và quy định áp dụng.
Theo nguồn tham khảo, khoản đền sách được tính bằng giá nhập sách cộng tiền quá hạn nếu có.
Nếu làm hư hỏng tài liệu, mức bồi thường phụ thuộc vào mức độ ảnh hưởng; nguồn tham khảo nêu mức tối đa bằng giá đền sách.
Người mượn có trách nhiệm báo tình trạng hư hỏng đã tồn tại trước khi mượn để tránh ghi nhận trách nhiệm không chính xác.',
  'Compensation', 'PendingReview', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-00000000000c',
  'QD12',
  'Xử lý vi phạm nội quy',
  'Tùy mức độ và số lần vi phạm, người đọc có thể bị nhắc nhở, khiển trách, mời ra khỏi thư viện hoặc áp dụng các hình thức xử lý khác theo quy định có thẩm quyền.
Hành vi làm mất, làm hư hỏng hoặc gây thiệt hại cho tài liệu có thể phát sinh trách nhiệm bồi thường.
Các biện pháp kỷ luật nghiêm trọng được nêu trong tài liệu nguồn chỉ được công bố hoặc áp dụng khi đã được đơn vị có thẩm quyền tại cơ sở xác nhận.',
  'Violation', 'PendingReview', 10, false, now(), now(), false
)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  policy_type = EXCLUDED.policy_type,
  status = CASE
    WHEN public.policy_rules.status IN ('Active', 'Inactive') THEN public.policy_rules.status
    ELSE 'PendingReview'
  END,
  updated_at = now(),
  is_deleted = false;

DELETE FROM public.policy_rule_parameters
WHERE policy_rule_id IN (
  'a2000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000002',
  'a2000000-0000-0000-0000-000000000003',
  'a2000000-0000-0000-0000-000000000004',
  'a2000000-0000-0000-0000-000000000005',
  'a2000000-0000-0000-0000-000000000006',
  'a2000000-0000-0000-0000-000000000007',
  'a2000000-0000-0000-0000-000000000008',
  'a2000000-0000-0000-0000-000000000009',
  'a2000000-0000-0000-0000-00000000000a',
  'a2000000-0000-0000-0000-00000000000b',
  'a2000000-0000-0000-0000-00000000000c'
);

DELETE FROM public.policy_rule_targets
WHERE policy_rule_id IN (
  'a2000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000002',
  'a2000000-0000-0000-0000-000000000003',
  'a2000000-0000-0000-0000-000000000004',
  'a2000000-0000-0000-0000-000000000005',
  'a2000000-0000-0000-0000-000000000006',
  'a2000000-0000-0000-0000-000000000007',
  'a2000000-0000-0000-0000-000000000008',
  'a2000000-0000-0000-0000-000000000009',
  'a2000000-0000-0000-0000-00000000000a',
  'a2000000-0000-0000-0000-00000000000b',
  'a2000000-0000-0000-0000-00000000000c'
);

INSERT INTO public.policy_rule_parameters (id, policy_rule_id, param_key, param_value, display_label)
SELECT gen_random_uuid(), x.policy_rule_id, x.param_key, x.param_value, x.display_label
FROM (
  VALUES
    ('a2000000-0000-0000-0000-000000000001'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000001'::uuid, 'source_label', 'Nội quy thư viện FPT — thẻ thư viện', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000001'::uuid, 'campus_note', 'Nguồn công khai ghi FPTU Hà Nội. Cần Admin xác nhận tại FPT TP.HCM trước khi duyệt.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000002'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000002'::uuid, 'source_label', 'Nội quy thư viện FPT — giờ mở cửa (FPTU Hà Nội)', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000002'::uuid, 'campus_note', 'Đây là giờ hoạt động trong tài liệu nguồn FPTU Hà Nội. Xác nhận giờ thực tế tại FPT TP.HCM trước khi công bố chính thức.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000003'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/9', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000003'::uuid, 'source_label', 'Dịch vụ thư viện FPT (nguồn công khai)', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000003'::uuid, 'campus_note', 'Không hiển thị một dịch vụ là đang hoạt động tại FPT TP.HCM nếu chưa được xác nhận.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000004'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000004'::uuid, 'source_label', 'Nội quy thư viện FPT — quy tắc chung', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000004'::uuid, 'campus_note', 'Nguồn công khai ghi FPTU Hà Nội. Cần Admin xác nhận phạm vi áp dụng tại FPT TP.HCM trước khi duyệt.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000005'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000005'::uuid, 'source_label', 'Nội quy thư viện FPT — bảo quản tài liệu; Dịch vụ mượn trả', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000005'::uuid, 'campus_note', 'Nguồn công khai ghi FPTU Hà Nội. Cần Admin xác nhận tại FPT TP.HCM trước khi duyệt.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000006'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/9', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000006'::uuid, 'source_label', 'Dịch vụ mượn, trả tài liệu FPT — điều kiện mượn', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000006'::uuid, 'campus_note', 'Xác minh giấy tờ được chấp nhận và quy trình thực tế tại FPT TP.HCM trước khi áp dụng chính thức.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/9', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'source_label', 'Dịch vụ mượn, trả tài liệu FPT — hạn ngạch và thời hạn', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'campus_note', 'Không tự động áp dụng các giới hạn này vào nghiệp vụ mượn sách. Giá trị cấu hình thực tế nằm ở module Chính sách (CS01, CS02, CS03).', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'student_max', '10', 'Hạn ngạch sinh viên/học sinh (tham khảo)'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'staff_max', '20', 'Hạn ngạch cán bộ/giảng viên (tham khảo)'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'vn_days', '7', 'Thời hạn sách tiếng Việt (ngày, tham khảo)'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'foreign_days', '14', 'Thời hạn sách ngoại văn/song ngữ (ngày, tham khảo)'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'renewal_max', '4', 'Số lượt gia hạn tối đa (tham khảo)'),
    ('a2000000-0000-0000-0000-000000000008'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/9', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000008'::uuid, 'source_label', 'Dịch vụ mượn, trả tài liệu FPT — trả tài liệu', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000008'::uuid, 'campus_note', 'Không đưa địa điểm phòng 107/108 tòa Delta (Hà Nội) vào nội dung chính thức của FPT TP.HCM khi chưa xác minh địa điểm tương ứng.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000009'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/9', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000009'::uuid, 'source_label', 'Dịch vụ mượn, trả tài liệu FPT — gia hạn', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000009'::uuid, 'campus_note', 'Thông tin nguồn đang chờ xác minh. Không cho phép gia hạn vượt quá giới hạn cấu hình thực tế trong hệ thống (CS03).', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000009'::uuid, 'vn_days', '7', 'Thời hạn sách tiếng Việt (ngày, tham khảo)'),
    ('a2000000-0000-0000-0000-000000000009'::uuid, 'foreign_days', '14', 'Thời hạn sách ngoại văn/song ngữ (ngày, tham khảo)'),
    ('a2000000-0000-0000-0000-000000000009'::uuid, 'renewal_max', '4', 'Số lượt gia hạn tối đa (tham khảo)'),
    ('a2000000-0000-0000-0000-00000000000a'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/9', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-00000000000a'::uuid, 'source_label', 'Dịch vụ mượn, trả tài liệu FPT — quá hạn', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-00000000000a'::uuid, 'campus_note', 'Không tự động áp dụng mức phí 5.000 VNĐ/ngày cho nghiệp vụ thực tế. Mức phí hệ thống nằm ở chính sách CS05 sau khi Admin xác nhận.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-00000000000a'::uuid, 'source_overdue_fee', '5000', 'Mức phí nguồn (VNĐ/tài liệu/ngày, chưa áp dụng)'),
    ('a2000000-0000-0000-0000-00000000000b'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/9', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-00000000000b'::uuid, 'source_label', 'Dịch vụ mượn, trả tài liệu FPT — mất/hư hỏng', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-00000000000b'::uuid, 'campus_note', 'Không tự tạo số tiền bồi thường cụ thể. Không tự kết luận người mượn cuối cùng chịu trách nhiệm khi chưa có quy trình xác minh tại FPT TP.HCM.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-00000000000c'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-00000000000c'::uuid, 'source_label', 'Nội quy thư viện FPT — xử lý vi phạm', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-00000000000c'::uuid, 'campus_note', 'Không tự triển khai đình chỉ học tập, buộc thôi học hoặc tước quyền sử dụng thư viện chỉ dựa trên dữ liệu nguồn này.', 'Ghi chú xác minh tại campus')
) AS x(policy_rule_id, param_key, param_value, display_label);

INSERT INTO public.policy_rule_targets (id, policy_rule_id, target_type, target_value, target_label)
VALUES
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000001', 'Role', 'Student', 'Sinh viên'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000001', 'Role', 'Staff', 'Nhân viên'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000001', 'Role', 'Lecturer', 'Giảng viên'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000002', 'All', '*', 'Tất cả bạn đọc'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000003', 'All', '*', 'Tất cả bạn đọc'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000004', 'All', '*', 'Tất cả bạn đọc'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000005', 'All', '*', 'Bạn đọc sử dụng tài liệu'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000006', 'Role', 'Student', 'Học sinh, sinh viên'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000006', 'Role', 'Staff', 'Cán bộ'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000006', 'Role', 'Lecturer', 'Giảng viên'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000007', 'Role', 'Student', 'Sinh viên/học sinh'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000007', 'Role', 'Staff', 'Cán bộ'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000007', 'Role', 'Lecturer', 'Giảng viên'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000008', 'All', '*', 'Bạn đọc mượn tài liệu'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000009', 'All', '*', 'Bạn đọc mượn tài liệu'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-00000000000a', 'All', '*', 'Bạn đọc mượn tài liệu'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-00000000000b', 'All', '*', 'Bạn đọc mượn tài liệu'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-00000000000c', 'All', '*', 'Tất cả bạn đọc');

INSERT INTO public.policy_rule_histories (
  id, policy_rule_id, changed_by_name, change_summary, after_json, created_at
)
SELECT gen_random_uuid(), x.id, 'Hệ thống',
  'Cập nhật bản tham khảo từ nguồn công khai thư viện FPT. Chờ Admin xác nhận tại FPT TP.HCM.',
  x.after_json, now()
FROM (
  VALUES
    ('a2000000-0000-0000-0000-000000000001'::uuid, '{"code":"QD01","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-000000000002'::uuid, '{"code":"QD02","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-000000000003'::uuid, '{"code":"QD03","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-000000000004'::uuid, '{"code":"QD04","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-000000000005'::uuid, '{"code":"QD05","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-000000000006'::uuid, '{"code":"QD06","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, '{"code":"QD07","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-000000000008'::uuid, '{"code":"QD08","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-000000000009'::uuid, '{"code":"QD09","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-00000000000a'::uuid, '{"code":"QD10","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-00000000000b'::uuid, '{"code":"QD11","status":"PendingReview"}'),
    ('a2000000-0000-0000-0000-00000000000c'::uuid, '{"code":"QD12","status":"PendingReview"}')
) AS x(id, after_json);
