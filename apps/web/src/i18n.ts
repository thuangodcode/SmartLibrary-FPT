import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  vi: {
    translation: {
      language: { switch: 'Chuyển ngôn ngữ', vietnamese: 'Tiếng Việt', english: 'Tiếng Anh' },
      header: {
        home: 'SmartLibrary - Trang chủ', searchLabel: 'Tìm sách trong thư viện', searchBook: 'Tìm sách',
        searchPlaceholder: 'Tên sách, tác giả, ISBN hoặc điều bạn muốn học', searchButton: 'Tìm trong thư viện',
        searchSuggestions: 'Gợi ý sách', searchMore: 'Nhập thêm ít nhất 1 ký tự để xem gợi ý.',
        searchLoading: 'Đang tìm sách…', searchError: 'Không tải được gợi ý. Nhấn “Tìm trong thư viện” để thử lại.',
        searchEmpty: 'Chưa tìm thấy sách phù hợp.', unknownAuthor: 'Chưa rõ tác giả',
        categories: 'Danh mục', loadingCategories: 'Đang tải danh mục…', categoriesError: 'Không tải được danh mục.',
        noCategories: 'Chưa có danh mục sách.', catalog: 'Khám phá sách', news: 'Tin tức', recommendations: 'Gợi ý sách',
        lightTheme: 'Chuyển sang giao diện sáng', darkTheme: 'Chuyển sang giao diện tối',
        lightThemeTitle: 'Giao diện sáng', darkThemeTitle: 'Giao diện tối', admin: 'Quản trị', librarian: 'Thủ thư',
        notifications: 'Thông báo', recentUpdates: 'Cập nhật gần đây', loadingNotifications: 'Đang tải thông báo...',
        noNotifications: 'Chưa có thông báo.', previous: 'Trước', next: 'Sau',
        accountMenu: 'Menu tài khoản', profile: 'Hồ sơ cá nhân', support: 'Hỗ trợ', history: 'Mượn & trả của tôi',
        favorites: 'Sách yêu thích', logout: 'Đăng xuất', login: 'Đăng nhập', register: 'Đăng ký',
        closeMenu: 'Đóng menu', openMenu: 'Mở menu', logoutSuccess: 'Đăng xuất thành công', logoutMessage: 'Bạn đã đăng xuất khỏi SmartLibrary.',
      },
      shell: {
        adminOverview: 'Tổng quan', users: 'Quản lý người dùng', policies: 'Quản lý chính sách', regulations: 'Quản lý quy định',
        reports: 'Thống kê & báo cáo', aiSettings: 'Cấu hình AI', librarianOverview: 'Tổng quan',
        services: 'Quản lý dịch vụ', books: 'Sách & Biên mục', approvals: 'Duyệt người đọc', readers: 'Độc giả',
        readerSupport: 'Hỗ trợ độc giả', news: 'Tin tức & Thông báo', librarianReports: 'Thống kê & báo cáo',
        librarianAi: 'Thiết lập AI nghiệp vụ', profile: 'Hồ sơ cá nhân', libraryManagement: 'Quản lý thư viện',
        updateApiKey: 'Cập nhật API Key', reportApproved: 'Báo cáo đã được duyệt', reportRevision: 'Admin yêu cầu chỉnh sửa',
        viewReport: 'Xem báo cáo', noNotifications: 'Chưa có thông báo.', librarian: 'Thủ thư', administrator: 'Quản trị viên',
        circulationLoans: 'Mượn sách', circulationReturn: 'Trả sách', reservations: 'Đặt chỗ', overdue: 'Quá hạn & Sự cố', fines: 'Phí phạt',
        supportRequests: 'Đơn tiếp nhận', supportReplies: 'Phản hồi đơn', reportAssignments: 'Theo dõi giao việc',
        reportActivity: 'Hoạt động thư viện', reportFinance: 'Tài chính', reportCollection: 'Kho sách',
        reportPeriodic: 'Báo cáo định kỳ', reportLibrary: 'Thư viện báo cáo', reportTemplates: 'Quản lý mẫu báo cáo',
      },
    },
  },
  en: {
    translation: {
      language: { switch: 'Switch language', vietnamese: 'Vietnamese', english: 'English' },
      header: {
        home: 'SmartLibrary - Home', searchLabel: 'Search the library', searchBook: 'Search books',
        searchPlaceholder: 'Title, author, ISBN, or a topic to learn', searchButton: 'Search library',
        searchSuggestions: 'Book suggestions', searchMore: 'Type at least one more character to see suggestions.',
        searchLoading: 'Searching books…', searchError: 'Could not load suggestions. Select “Search library” to try again.',
        searchEmpty: 'No matching books found.', unknownAuthor: 'Author unavailable',
        categories: 'Categories', loadingCategories: 'Loading categories…', categoriesError: 'Could not load categories.',
        noCategories: 'No book categories yet.', catalog: 'Explore books', news: 'News', recommendations: 'Recommendations',
        lightTheme: 'Switch to light theme', darkTheme: 'Switch to dark theme',
        lightThemeTitle: 'Light theme', darkThemeTitle: 'Dark theme', admin: 'Admin', librarian: 'Librarian',
        notifications: 'Notifications', recentUpdates: 'Recent updates', loadingNotifications: 'Loading notifications...',
        noNotifications: 'No notifications yet.', previous: 'Previous', next: 'Next',
        accountMenu: 'Account menu', profile: 'Profile', support: 'Support', history: 'My loans & returns',
        favorites: 'Favorite books', logout: 'Sign out', login: 'Sign in', register: 'Register',
        closeMenu: 'Close menu', openMenu: 'Open menu', logoutSuccess: 'Signed out', logoutMessage: 'You have signed out of SmartLibrary.',
      },
      shell: {
        adminOverview: 'Overview', users: 'User management', policies: 'Policy management', regulations: 'Regulations',
        reports: 'Analytics & reports', aiSettings: 'AI settings', librarianOverview: 'Overview',
        services: 'Library services', books: 'Books & cataloging', approvals: 'Reader approvals', readers: 'Readers',
        readerSupport: 'Reader support', news: 'News & announcements', librarianReports: 'Analytics & reports',
        librarianAi: 'AI operations settings', profile: 'Profile', libraryManagement: 'Library management',
        updateApiKey: 'Update API key', reportApproved: 'Report approved', reportRevision: 'Admin requested changes',
        viewReport: 'View report', noNotifications: 'No notifications yet.', librarian: 'Librarian', administrator: 'Administrator',
        circulationLoans: 'Borrow books', circulationReturn: 'Return books', reservations: 'Reservations', overdue: 'Overdue & incidents', fines: 'Fines',
        supportRequests: 'Support requests', supportReplies: 'Support replies', reportAssignments: 'Assignment tracking',
        reportActivity: 'Library activity', reportFinance: 'Finance', reportCollection: 'Collection',
        reportPeriodic: 'Periodic reports', reportLibrary: 'Report library', reportTemplates: 'Report templates',
      },
    },
  },
} as const;

window.localStorage.setItem('smartlibrary.language', 'vi');

void i18n.use(initReactI18next).init({
  resources,
  lng: 'vi',
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (language) => {
  if (language !== 'vi') {
    void i18n.changeLanguage('vi');
    return;
  }
  window.localStorage.setItem('smartlibrary.language', 'vi');
  document.documentElement.lang = 'vi';
});

document.documentElement.lang = 'vi';

export default i18n;
