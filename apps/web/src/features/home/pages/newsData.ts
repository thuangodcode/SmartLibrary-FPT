export interface NewsArticleItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  imageUrl?: string | null;
  isPinned: boolean;
  authorName: string;
  createdAt: string;
  updatedAt?: string;
}

export const FALLBACK_NEWS: NewsArticleItem[] = [
  {
    id: 'seed-1',
    title: 'Thư viện SmartLibrary chính thức tích hợp AI Tìm kiếm Ngữ Nghĩa & Đề xuất sách thông minh',
    category: 'Tính năng mới',
    summary: 'Sinh viên FPT giờ đây có thể tìm kiếm sách bằng các câu hỏi tự nhiên như "Sách học vẽ sơ đồ tư duy cho dân IT" mà không cần nhớ chính xác tên tác giả hoặc mã sách.',
    content: `Chào đón học kỳ mới 2026, SmartLibrary trân trọng thông báo ra mắt tính năng Tìm kiếm Ngữ nghĩa (Semantic AI Search) và Trợ lý ảo gợi ý sách tự động.\n\nVới công nghệ Vector Database và Embedding tiên tiến, hệ thống có khả năng hiểu ngữ cảnh câu hỏi, gợi ý sách dựa trên chuyên ngành, môn học đang theo học và hành vi đọc của từng sinh viên.\n\nCác bạn sinh viên chỉ cần gõ nội dung muốn tìm kiếm vào thanh tìm kiếm AI tại trang chủ để nhận được các đầu sách phù hợp nhất kèm tỷ lệ độ khớp (Match Score).`,
    imageUrl: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?q=80&w=1200&auto=format&fit=crop',
    isPinned: false,
    authorName: 'Thủ thư Trưởng',
    createdAt: '2026-10-24T08:30:00Z',
  },
  {
    id: 'seed-2',
    title: 'Thông báo lịch mở cửa phòng tự học 24/7 xuyên suốt kỳ thi Học kỳ 1 (2026 - 2027)',
    category: 'Thông báo',
    summary: 'Phòng tự học đa năng tại tầng 2 và khu vực Quiet Zone tầng 3 sẽ mở cửa xuyên đêm 24/7 phục vụ các bạn sinh viên ôn thi từ ngày 05/10 đến hết ngày 25/10.',
    content: `Nhằm tạo điều kiện tốt nhất cho sinh viên trong mùa thi cử cam go, Thư viện SmartLibrary - Đại học FPT thông báo điều chỉnh thời gian phục vụ:\n\n1. Khu vực mở cửa 24/7: Toàn bộ tầng 2 (Khu thảo luận nhóm) và Quiet Zone tầng 3.\n2. Tiện ích kèm theo: Hệ thống điều hòa, Wi-Fi tốc độ cao, máy nước nóng lạnh và khu vực sạc laptop được trang bị đầy đủ tại từng bàn.\n3. Lưu ý an ninh: Độc giả vui lòng xuất trình thẻ sinh viên hoặc quét mã QR trên ứng dụng SmartLibrary khi ra vào sau 21h00.`,
    imageUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?q=80&w=1200&auto=format&fit=crop',
    isPinned: true,
    authorName: 'Ban Quản trị Thư viện',
    createdAt: '2026-10-22T09:00:00Z',
  },
  {
    id: 'seed-3',
    title: 'Cập nhật hơn 500+ đầu sách Công nghệ Thông tin, AI & Kỹ năng mềm mới nhập kho',
    category: 'Sách mới',
    summary: 'Hàng loạt sách chuyên khảo chất lượng quốc tế về Machine Learning, React 19, Thiết kế hệ thống phân tán và Kỹ năng lãnh đạo đã có mặt trên kệ sách.',
    content: `Thư viện vừa hoàn tất thủ tục phân loại, dán mã RFID và nhập kho hơn 500 đầu sách mới phục vụ các khối ngành CNTT, An toàn thông tin, Thiết kế đồ họa và Quản trị kinh doanh.\n\nMột số tựa sách tiêu biểu:\n- Designing Data-Intensive Applications (Bản cập nhật)\n- Deep Learning with PyTorch & Generative AI in Practice\n- Clean Architecture & Domain-Driven Design\n- Tư duy phản biện và Năng lực ra quyết định trong thời đại số\n\nĐộc giả có thể tra cứu và đặt giữ sách trước trên Web hoặc ứng dụng di động ngay hôm nay!`,
    imageUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=1200&auto=format&fit=crop',
    isPinned: false,
    authorName: 'Bộ phận Bổ sung Tài liệu',
    createdAt: '2026-10-18T14:15:00Z',
  },
  {
    id: 'seed-4',
    title: 'Hội thảo Book Talk: "Văn hóa đọc trong kỷ nguyên Trí tuệ Nhân tạo"',
    category: 'Sự kiện',
    summary: 'Giao lưu cùng diễn giả khách mời, tác giả sách công nghệ nổi tiếng và nhận hàng trăm phần quà cùng voucher mượn sách không giới hạn.',
    content: `Thư viện phối hợp cùng CLB Sách FPT tổ chức buổi Workshop & Book Talk đặc biệt vào sáng thứ Bảy tuần này tại Hội trường Thư viện.\n\nNội dung chính:\n- Làm sao để duy trì sự tập trung sâu khi đọc sách trong thời đại ngập tràn video ngắn?\n- Tận dụng AI để tóm tắt và ghi nhớ kiến thức từ sách chuyên khảo hiệu quả.\n- Minigame đố vui nhận sách có chữ ký tác giả và thẻ mượn sách ưu tiên.\n\nThời gian: 09h00 - 11h30 Thứ Bảy. Đăng ký tham gia miễn phí qua ứng dụng SmartLibrary!`,
    imageUrl: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?q=80&w=1200&auto=format&fit=crop',
    isPinned: false,
    authorName: 'CLB Sách FPT',
    createdAt: '2026-10-15T10:00:00Z',
  },
  {
    id: 'seed-5',
    title: 'Hướng dẫn sử dụng tủ gửi đồ thông minh bằng nhận diện khuôn mặt & thẻ sinh viên',
    category: 'Hướng dẫn',
    summary: 'Các bước thao tác nhanh với hệ thống Smart Locker tại sảnh vào thư viện: check-in tự động, giữ đồ an toàn và tiện lợi.',
    content: `Nhằm đảm bảo an toàn tài sản và không gian yên tĩnh bên trong thư viện, SmartLibrary đã đưa vào vận hành hệ thống Smart Locker 200 ngăn tại sảnh tầng 1.\n\nCách sử dụng:\n1. Chạm thẻ sinh viên hoặc đứng trước màn hình nhận diện khuôn mặt.\n2. Một ngăn tủ sẽ tự động bật mở. Đặt ba lô, túi xách vào ngăn và đóng chặt cửa tủ.\n3. Khi ra về, quét lại thẻ sinh viên hoặc FaceID tại đúng vị trí ban đầu để mở tủ lấy đồ.\n\nLưu ý: Không để tài sản có giá trị cao hoặc qua đêm tại tủ gửi đồ.`,
    imageUrl: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?q=80&w=1200&auto=format&fit=crop',
    isPinned: false,
    authorName: 'Ban Quản trị Thư viện',
    createdAt: '2026-10-10T16:30:00Z',
  },
  {
    id: 'seed-6',
    title: 'Nâng cấp hạn mức mượn sách tài liệu điện tử (E-Book & Luận văn số)',
    category: 'Thông báo',
    summary: 'Sinh viên thực hiện đồ án tốt nghiệp và học viên cao học được tăng hạn mức tải và đọc tài liệu nghiên cứu số lên 20 tài liệu/tháng.',
    content: `Hệ thống Thư viện số SmartLibrary trân trọng thông báo nâng cấp hạn mức truy cập cơ sở dữ liệu số cho sinh viên học kỳ 7, 8, 9 và các học viên đang làm luận văn tốt nghiệp.\n\nBạn có thể truy cập kho luận văn xuất sắc các khóa trước, tạp chí khoa học chuyên ngành và giáo trình điện tử bản quyền từ cổng e-Library mà không bị giới hạn số lần đọc trong ngày.`,
    imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=1200&auto=format&fit=crop',
    isPinned: false,
    authorName: 'Bộ phận Thư viện Số',
    createdAt: '2026-10-05T11:00:00Z',
  },
];
