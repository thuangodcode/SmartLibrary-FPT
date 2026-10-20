-- Reference library regulations (QD01-QD08) from public FPT Library sources.
-- Status stays Draft until an Admin confirms applicability for FPT HCM.
-- Does not modify CS01-CS06 borrow/fine policies.

INSERT INTO public.policy_rules (
  id, code, name, description, policy_type, status, priority, overrides_general,
  created_at, updated_at, is_deleted
)
VALUES
(
  'a2000000-0000-0000-0000-000000000001',
  'QD01',
  'Sử dụng thẻ thư viện',
  'Bạn đọc cần sử dụng thẻ sinh viên hoặc thẻ nhân viên theo hướng dẫn của thư viện khi sử dụng dịch vụ. Không sử dụng thẻ của người khác hoặc cho người khác mượn thẻ.',
  'LibraryUse', 'Draft', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000002',
  'QD02',
  'Giữ gìn trật tự',
  'Giữ trật tự, nói nhỏ, không gây ảnh hưởng đến việc học tập và nghiên cứu của người khác. Để điện thoại ở chế độ im lặng và không nói chuyện điện thoại gây ảnh hưởng trong khu vực thư viện.',
  'Conduct', 'Draft', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000003',
  'QD03',
  'Giữ vệ sinh chung',
  'Giữ gìn vệ sinh, bỏ rác đúng nơi quy định, không hút thuốc và không làm mất vệ sinh không gian học tập chung.',
  'Conduct', 'Draft', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000004',
  'QD04',
  'Quy định về đồ ăn, thức uống và vật nguy hiểm',
  'Tuân thủ hướng dẫn của thư viện về đồ ăn, thức uống và các vật có nguy cơ gây cháy nổ hoặc nguy hiểm. Phạm vi áp dụng cụ thể cần được Admin xác nhận theo nội quy tại campus TP.HCM.',
  'Safety', 'Draft', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000005',
  'QD05',
  'Bảo quản tài liệu thư viện',
  'Không viết, vẽ, đánh dấu, xé, gấp hoặc làm ướt sách. Không làm hư hỏng, mất trang hoặc gây ảnh hưởng đến tình trạng tài liệu.',
  'DocumentCare', 'Draft', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000006',
  'QD06',
  'Không tự ý mang tài liệu ra khỏi thư viện',
  'Không mang tài liệu ra khỏi thư viện khi chưa hoàn tất thủ tục mượn hoặc chưa được người có thẩm quyền cho phép.',
  'DocumentUse', 'Draft', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000007',
  'QD07',
  'Kiểm tra tình trạng tài liệu',
  'Bạn đọc cần kiểm tra tình trạng tài liệu khi nhận và thông báo cho thủ thư nếu phát hiện hư hỏng hoặc sai lệch. Có trách nhiệm bảo quản tài liệu trong thời gian sử dụng.',
  'DocumentCare', 'Draft', 10, false, now(), now(), false
),
(
  'a2000000-0000-0000-0000-000000000008',
  'QD08',
  'Xử lý hành vi vi phạm nội quy',
  'Việc xử lý vi phạm phải căn cứ nội quy được phê duyệt, mức độ vi phạm và quy trình xử lý của nhà trường. Thủ thư có thể ghi nhận, lập báo cáo hoặc chuyển vụ việc đến người có thẩm quyền theo quy trình.',
  'Violation', 'Draft', 10, false, now(), now(), false
)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  policy_type = EXCLUDED.policy_type,
  status = CASE
    WHEN public.policy_rules.status IN ('Active', 'Inactive') THEN public.policy_rules.status
    ELSE 'Draft'
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
  'a2000000-0000-0000-0000-000000000008'
)
AND param_key IN ('source_url', 'source_label', 'campus_note');

DELETE FROM public.policy_rule_targets
WHERE policy_rule_id IN (
  'a2000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000002',
  'a2000000-0000-0000-0000-000000000003',
  'a2000000-0000-0000-0000-000000000004',
  'a2000000-0000-0000-0000-000000000005',
  'a2000000-0000-0000-0000-000000000006',
  'a2000000-0000-0000-0000-000000000007',
  'a2000000-0000-0000-0000-000000000008'
);

INSERT INTO public.policy_rule_parameters (id, policy_rule_id, param_key, param_value, display_label)
SELECT gen_random_uuid(), x.policy_rule_id, x.param_key, x.param_value, x.display_label
FROM (
  VALUES
    ('a2000000-0000-0000-0000-000000000001'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000001'::uuid, 'source_label', 'Nội quy thư viện FPT — Điều 1, Điều 4.1', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000001'::uuid, 'campus_note', 'Nguồn công khai trên library.fpt.edu.vn ghi campus Hòa Lạc. Cần Admin xác nhận phạm vi áp dụng tại Đại học FPT TP.HCM trước khi chuyển sang Đang áp dụng.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000002'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000002'::uuid, 'source_label', 'Nội quy thư viện FPT — Điều 4.2, Điều 4.5', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000002'::uuid, 'campus_note', 'Nguồn công khai trên library.fpt.edu.vn ghi campus Hòa Lạc. Cần Admin xác nhận phạm vi áp dụng tại Đại học FPT TP.HCM trước khi chuyển sang Đang áp dụng.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000003'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000003'::uuid, 'source_label', 'Nội quy thư viện FPT — Điều 4.3', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000003'::uuid, 'campus_note', 'Nguồn công khai trên library.fpt.edu.vn ghi campus Hòa Lạc. Cần Admin xác nhận phạm vi áp dụng tại Đại học FPT TP.HCM trước khi chuyển sang Đang áp dụng.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000004'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000004'::uuid, 'source_label', 'Nội quy thư viện FPT — Điều 4.4', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000004'::uuid, 'campus_note', 'Nguồn công khai trên library.fpt.edu.vn ghi campus Hòa Lạc. Phạm vi đồ ăn, thức uống và vật nguy hiểm cần Admin xác nhận theo nội quy campus TP.HCM.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000005'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000005'::uuid, 'source_label', 'Nội quy thư viện FPT — Điều 4.6–4.8; Dịch vụ mượn trả — mục 1.5', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000005'::uuid, 'campus_note', 'Nguồn công khai trên library.fpt.edu.vn ghi campus Hòa Lạc. Cần Admin xác nhận phạm vi áp dụng tại Đại học FPT TP.HCM trước khi chuyển sang Đang áp dụng.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000006'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000006'::uuid, 'source_label', 'Nội quy thư viện FPT — Điều 5.2', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000006'::uuid, 'campus_note', 'Nguồn công khai trên library.fpt.edu.vn ghi campus Hòa Lạc. Cần Admin xác nhận phạm vi áp dụng tại Đại học FPT TP.HCM trước khi chuyển sang Đang áp dụng.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/9', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'source_label', 'Dịch vụ mượn, trả tài liệu FPT — mục 1.5; Nội quy — Điều 5.6', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, 'campus_note', 'Nguồn công khai trên library.fpt.edu.vn ghi campus Hòa Lạc. Cần Admin xác nhận phạm vi áp dụng tại Đại học FPT TP.HCM trước khi chuyển sang Đang áp dụng.', 'Ghi chú xác minh tại campus'),
    ('a2000000-0000-0000-0000-000000000008'::uuid, 'source_url', 'https://library.fpt.edu.vn/Pages/Index/15', 'Nguồn tham khảo'),
    ('a2000000-0000-0000-0000-000000000008'::uuid, 'source_label', 'Nội quy thư viện FPT — Điều 6 (tham khảo quy trình, chưa chốt mức xử lý)', 'Nhãn nguồn'),
    ('a2000000-0000-0000-0000-000000000008'::uuid, 'campus_note', 'Không tự quy định hình thức kỷ luật, khóa tài khoản hoặc mức bồi thường cụ thể khi chưa có căn cứ được phê duyệt tại FPT TP.HCM.', 'Ghi chú xác minh tại campus')
) AS x(policy_rule_id, param_key, param_value, display_label);

INSERT INTO public.policy_rule_targets (id, policy_rule_id, target_type, target_value, target_label)
VALUES
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000001', 'Role', 'Student', 'Sinh viên'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000001', 'Role', 'Lecturer', 'Giảng viên'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000001', 'Role', 'Staff', 'Nhân viên'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000002', 'All', '*', 'Tất cả bạn đọc'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000003', 'All', '*', 'Tất cả bạn đọc'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000004', 'All', '*', 'Tất cả bạn đọc'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000005', 'All', '*', 'Tất cả bạn đọc sử dụng tài liệu'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000006', 'All', '*', 'Bạn đọc sử dụng tài liệu vật lý'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000007', 'All', '*', 'Bạn đọc mượn tài liệu'),
  (gen_random_uuid(), 'a2000000-0000-0000-0000-000000000008', 'All', '*', 'Tất cả bạn đọc');

INSERT INTO public.policy_rule_histories (
  id, policy_rule_id, changed_by_name, change_summary, after_json, created_at
)
SELECT gen_random_uuid(), x.id, 'Hệ thống',
  'Nhập bản tham khảo từ nguồn công khai thư viện FPT. Chờ Admin xác nhận trước khi áp dụng tại FPT TP.HCM.',
  x.after_json, now()
FROM (
  VALUES
    ('a2000000-0000-0000-0000-000000000001'::uuid, '{"code":"QD01","status":"Draft"}'),
    ('a2000000-0000-0000-0000-000000000002'::uuid, '{"code":"QD02","status":"Draft"}'),
    ('a2000000-0000-0000-0000-000000000003'::uuid, '{"code":"QD03","status":"Draft"}'),
    ('a2000000-0000-0000-0000-000000000004'::uuid, '{"code":"QD04","status":"Draft"}'),
    ('a2000000-0000-0000-0000-000000000005'::uuid, '{"code":"QD05","status":"Draft"}'),
    ('a2000000-0000-0000-0000-000000000006'::uuid, '{"code":"QD06","status":"Draft"}'),
    ('a2000000-0000-0000-0000-000000000007'::uuid, '{"code":"QD07","status":"Draft"}'),
    ('a2000000-0000-0000-0000-000000000008'::uuid, '{"code":"QD08","status":"Draft"}')
) AS x(id, after_json)
WHERE NOT EXISTS (
  SELECT 1 FROM public.policy_rule_histories h WHERE h.policy_rule_id = x.id
);
