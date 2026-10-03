import type { Book, Category, NewsItem, FaqItem, ServiceItem } from '../types';

export const MOCK_BOOKS: Book[] = [
  {
    id: 'b1',
    title: 'Lập Trình Web Hiện Đại Với React & TypeScript',
    author: 'Nguyễn Văn Minh',
    category: 'Công nghệ thông tin',
    isbn: '978-604-1-12345-6',
    publishYear: 2025,
    publisher: 'NXB Đại Học Quốc Gia',
    coverGradient: 'from-blue-600 to-indigo-900',
    rating: 4.9,
    reviewCount: 128,
    availableCopies: 5,
    totalCopies: 8,
    status: 'available',
    description: 'Hướng dẫn toàn diện từ cơ bản đến nâng cao xây dựng ứng dụng web chuẩn production.',
    matchScore: 98,
    recommendReason: 'Phù hợp với chuyên ngành CNTT và các môn học bạn đang đăng ký.',
    borrowCount: 342,
    isNewArrival: true,
  },
  {
    id: 'b2',
    title: 'Nhập Môn Trí Tuệ Nhân Tạo & Học Máy',
    author: 'PGS. TS. Trần Hoàng Nam',
    category: 'Trí tuệ nhân tạo',
    isbn: '978-604-1-67890-1',
    publishYear: 2024,
    publisher: 'NXB Giáo Dục',
    coverGradient: 'from-purple-600 to-indigo-900',
    rating: 4.8,
    reviewCount: 95,
    availableCopies: 2,
    totalCopies: 6,
    status: 'available',
    description: 'Kiến thức cốt lõi về Machine Learning, Neural Networks và Ứng dụng thực tế.',
    matchScore: 94,
    recommendReason: 'Dựa trên thói quen tìm kiếm các tài liệu về AI/Python gần đây của bạn.',
    borrowCount: 289,
    isNewArrival: false,
  },
  {
    id: 'b3',
    title: 'Thiết Kế Cơ Sở Dữ Chuẩn SQL & NoSQL',
    author: 'Đỗ Thị Hồng Hạnh',
    category: 'Công nghệ thông tin',
    isbn: '978-604-1-54321-0',
    publishYear: 2023,
    publisher: 'NXB Kỹ Thuật',
    coverGradient: 'from-emerald-600 to-teal-900',
    rating: 4.7,
    reviewCount: 64,
    availableCopies: 0,
    totalCopies: 5,
    status: 'reserved_only',
    description: 'Tối ưu hóa truy vấn SQL, thiết kế schema PostgreSQL và cơ sở dữ liệu Supabase.',
    borrowCount: 215,
    isNewArrival: false,
  },
  {
    id: 'b4',
    title: 'Kinh Tế Học Vĩ Mô Cho Sinh Viên Ngành Công Nghệ',
    author: 'TS. Lê Anh Tuấn',
    category: 'Kinh tế & Quản trị',
    isbn: '978-604-1-99887-7',
    publishYear: 2025,
    publisher: 'NXB Kinh Tế',
    coverGradient: 'from-amber-600 to-red-900',
    rating: 4.6,
    reviewCount: 42,
    availableCopies: 7,
    totalCopies: 10,
    status: 'available',
    description: 'Góc nhìn kinh tế học kết hợp với xu hướng chuyển đổi số và khởi nghiệp công nghệ.',
    matchScore: 89,
    recommendReason: 'Sách giáo trình được đề xuất cho các tín chỉ tự chọn của FPT.',
    borrowCount: 180,
    isNewArrival: true,
  },
  {
    id: 'b5',
    title: 'Kỹ Năng Thuyết Trình & Phản Biện Trong Môi Trường Số',
    author: 'Phạm Phương Thảo',
    category: 'Kỹ năng mềm',
    isbn: '978-604-1-11223-4',
    publishYear: 2024,
    publisher: 'NXB Trẻ',
    coverGradient: 'from-rose-500 to-pink-800',
    rating: 4.9,
    reviewCount: 156,
    availableCopies: 4,
    totalCopies: 6,
    status: 'available',
    description: 'Bí quyết làm chủ sân khấu, xây dựng Slide ấn tượng và bảo vệ đồ án tốt nghiệp thành công.',
    borrowCount: 412,
    isNewArrival: false,
  },
  {
    id: 'b6',
    title: 'Kiến Trúc Phần Mềm Doanh Nghiệp (Clean Architecture)',
    author: 'Robert C. Martin (Bản dịch VN)',
    category: 'Công nghệ thông tin',
    isbn: '978-604-1-33445-5',
    publishYear: 2024,
    publisher: 'NXB Lao Động',
    coverGradient: 'from-slate-700 to-slate-950',
    rating: 5.0,
    reviewCount: 210,
    availableCopies: 1,
    totalCopies: 4,
    status: 'available',
    description: 'Các quy tắc cốt lõi về cấu trúc phần mềm linh hoạt, dễ bảo trì và mở rộng.',
    matchScore: 96,
    recommendReason: 'Gợi ý bởi AI dành cho sinh viên chuẩn bị làm Capstone Project.',
    borrowCount: 390,
    isNewArrival: true,
  }
];

export const MOCK_CATEGORIES: Category[] = [
  {
    id: 'c1',
    name: 'Công Nghệ Thông Tin',
    iconName: 'Code',
    bookCount: 3450,
    colorClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900',
    description: 'Lập trình, Thuật toán, Cơ sở dữ liệu & An toàn thông tin.'
  },
  {
    id: 'c2',
    name: 'Trí Tuệ Nhân Tạo & Data',
    iconName: 'Sparkles',
    bookCount: 1280,
    colorClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900',
    description: 'Machine Learning, Deep Learning, Big Data & LLM.'
  },
  {
    id: 'c3',
    name: 'Kinh Tế & Quản Trị',
    iconName: 'TrendingUp',
    bookCount: 2150,
    colorClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900',
    description: 'Tài chính, Marketing, Quản trị kinh doanh & Startup.'
  },
  {
    id: 'c4',
    name: 'Thiết Kế Đồ Họa & UI/UX',
    iconName: 'Palette',
    bookCount: 940,
    colorClass: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-900',
    description: 'Design System, Figma, Trải nghiệm người dùng & Sáng tạo.'
  },
  {
    id: 'c5',
    name: 'Kỹ Năng Mềm & Phát Triển',
    iconName: 'Compass',
    bookCount: 1860,
    colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
    description: 'Thuyết trình, Quản lý thời gian, Tư duy phản biệt.'
  },
  {
    id: 'c6',
    name: 'Ngoại Ngữ & Chứng Chỉ',
    iconName: 'Globe',
    bookCount: 1420,
    colorClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900',
    description: 'IELTS, TOEIC, Tiếng Nhật JLPT, Tiếng Hoa.'
  }
];

export const MOCK_SERVICES: ServiceItem[] = [
  {
    id: 's1',
    title: 'Mượn Sách Trực Tuyến',
    description: 'Tra cứu và đăng ký giữ sách tại quầy chỉ với vài cú nhấp chuột.',
    iconName: 'BookOpen',
    route: '/borrow',
    badge: 'Phổ biến'
  },
  {
    id: 's2',
    title: 'Gia Hạn Tự Động',
    description: 'Gia hạn thời gian mượn sách nhanh chóng khi chưa có người đặt chờ.',
    iconName: 'RefreshCw',
    route: '/renew'
  },
  {
    id: 's3',
    title: 'Đặt Phòng Học Nhóm',
    description: 'Đặt phòng học thông minh có máy chiếu và bảng trắng tại thư viện.',
    iconName: 'Users',
    route: '/facilities',
    badge: 'Mới'
  },
  {
    id: 's4',
    title: 'Tra Cứu Phạt & Trả',
    description: 'Xem lịch sử phạt, tính phí trễ hạn minh bạch và thanh toán qua QR Code.',
    iconName: 'CreditCard',
    route: '/fines'
  }
];

export const MOCK_NEWS: NewsItem[] = [
  {
    id: 'n1',
    title: 'Thư viện SmartLibrary chính thức tích hợp AI Tìm kiếm Ngữ Nghĩa',
    date: '28/09/2026',
    category: 'Tính năng mới',
    summary: 'Sinh viên giờ đây có thể tìm sách bằng các câu mô tả tự nhiên như "Sách học vẽ sơ đồ tư duy cho dân IT" mà không cần biết chính xác tên tác giả.',
    readTime: '3 phút đọc'
  },
  {
    id: 'n2',
    title: 'Thông báo lịch mở cửa xuyên suốt kỳ thi Học kỳ 1 (2026 - 2027)',
    date: '25/09/2026',
    category: 'Thông báo',
    summary: 'Phòng đọc tự học 24/7 tại tầng 2 sẽ phục vụ liên tục trong 2 tuần thi từ ngày 05/10 đến hết ngày 20/10/2026.',
    readTime: '2 phút đọc'
  },
  {
    id: 'n3',
    title: 'Cập nhật thêm 500+ đầu sách CNTT & AI mới nhập kho tháng 9',
    date: '20/09/2026',
    category: 'Sách mới',
    summary: 'Các đầu sách giáo trình cập nhật nhất về LLM, Prompt Engineering và React 19 đã sẵn sàng trên kệ sách.',
    readTime: '4 phút đọc'
  }
];

export const MOCK_FAQS: FaqItem[] = [
  {
    id: 'f1',
    question: 'Tôi được mượn tối đa bao nhiêu cuốn sách cùng một lúc?',
    answer: 'Sinh viên được mượn tối đa 5 cuốn sách trong thời hạn 14 ngày. Đối với sinh viên làm Đồ án tốt nghiệp (Capstone), hạn mức được nâng lên 8 cuốn trong 30 ngày.',
    category: 'Quy định mượn'
  },
  {
    id: 'f2',
    question: 'Tính năng AI gợi ý sách hoạt động như thế nào?',
    answer: 'Hệ thống AI phân tích môn học bạn đăng ký trong kỳ, thói quen mượn sách trước đó và mô tả nguyện vọng của bạn để đưa ra danh sách các tài liệu phù hợp nhất kèm tỷ lệ match (%).',
    category: 'Tính năng AI'
  },
  {
    id: 'f3',
    question: 'Làm thế nào để gia hạn thêm thời gian giữ sách?',
    answer: 'Bạn có thể vào mục "Lịch sử mượn" trên ứng dụng Web hoặc App Mobile, bấm nút "Gia hạn". Mỗi cuốn sách được gia hạn tối đa 2 lần (mỗi lần 7 ngày) nếu không có độc giả khác đặt trước.',
    category: 'Gia hạn'
  },
  {
    id: 'f4',
    question: 'Phí phạt quá hạn mượn sách được tính ra sao?',
    answer: 'Phí quá hạn là 5.000 VNĐ / ngày / cuốn. Bạn có thể thanh toán trực tiếp qua cổng VNPay/MoMo trên ứng dụng hoặc tại Quầy thủ thư tầng 1.',
    category: 'Phạt & Phí'
  }
];
