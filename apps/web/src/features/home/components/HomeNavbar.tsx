import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr';
import { Bell, BookOpen, ChevronDown, CircleHelp, Heart, History, LogOut, Menu, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import smartLibraryLogo from '../../../assets/figma/smartlibrary-logo.png';
import { useToast } from '../../../components/ui/useToast';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import {
  listInboxNoticePage,
  markAllInboxNoticesRead,
  type InboxNotice,
} from '../../librarian/notificationsApi';
import { useHomeCategories } from '../hooks/useHomeData';
import './HomeNavbar.css';

type HomeNavSection = 'catalog' | 'news' | 'policies';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

const HomeNavbar: React.FC<{ activeSection?: HomeNavSection; searchSlot?: ReactNode }> = ({ activeSection, searchSlot }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [readerNotifications, setReaderNotifications] = useState<InboxNotice[]>([]);
  const [notificationPage, setNotificationPage] = useState(1);
  const [notificationTotalPages, setNotificationTotalPages] = useState(1);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newlySeenNotificationIds, setNewlySeenNotificationIds] = useState<Set<string>>(() => new Set());
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const logout = useAuthStore((state) => state.logout);
  const [notificationsLoading, setNotificationsLoading] = useState(
    () => user?.role === 'Reader' && Boolean(accessToken),
  );
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const categoriesQuery = useHomeCategories();
  const { showToast } = useToast();
  const categories = categoriesQuery.data ?? [];

  const loadReaderNotifications = useCallback(async () => {
    if (!accessToken) return;
    try {
      const result = await listInboxNoticePage(accessToken, notificationPage, 10);
      setReaderNotifications(result.items);
      setNotificationTotalPages(Math.max(1, result.totalPages));
      setNotificationUnreadCount(result.unreadCount);
      setNotificationError(null);
    } catch (caught) {
      setNotificationError(caught instanceof Error ? caught.message : 'Không tải được thông báo.');
    } finally {
      setNotificationsLoading(false);
    }
  }, [accessToken, notificationPage]);

  useEffect(() => {
    if (user?.role !== 'Reader' || !accessToken) return undefined;
    void Promise.resolve().then(loadReaderNotifications);
    const timer = window.setInterval(() => void loadReaderNotifications(), 60_000);
    return () => window.clearInterval(timer);
  }, [accessToken, loadReaderNotifications, user?.role]);

  const markAllReaderNotificationsRead = async () => {
    if (!accessToken || notificationUnreadCount === 0) return;
    try {
      await markAllInboxNoticesRead(accessToken);
      setReaderNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setNotificationUnreadCount(0);
    } catch (caught) {
      showToast({
        type: 'error',
        title: 'Không thể cập nhật thông báo',
        message: caught instanceof Error ? caught.message : 'Vui lòng thử lại.',
      });
    }
  };

  const closeNotifications = () => {
    setNotificationsOpen(false);
    setNewlySeenNotificationIds(new Set());
  };

  const toggleNotifications = () => {
    if (notificationsOpen) {
      closeNotifications();
      return;
    }
    setNewlySeenNotificationIds(new Set(readerNotifications.filter((notice) => !notice.isRead).map((notice) => notice.id)));
    setNotificationsOpen(true);
    void markAllReaderNotificationsRead();
  };

  useEffect(() => {
    const closePopovers = (event: PointerEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        closeNotifications();
      }
    };
    document.addEventListener('pointerdown', closePopovers);
    return () => document.removeEventListener('pointerdown', closePopovers);
  }, []);

  useEffect(() => {
    if (user?.role !== 'Reader' || !accessToken) return undefined;
    let active = true;
    const retryTimers: number[] = [];
    const loadSupportUnreadCount = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/support/chat/unread-count`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await parseApiResponse<ApiEnvelope<{ unreadCount: number }>>(response);
        if (active && response.ok && result?.success) setSupportUnreadCount(result.data?.unreadCount ?? 0);
      } catch {
        // The support page will surface connectivity errors; the global menu stays quiet.
      }
    };
    const clearSupportUnreadCount = () => setSupportUnreadCount(0);
    const supportHub = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/support-chat`, {
        accessTokenFactory: () => accessToken,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
    supportHub.on('ReceiveChatMessage', (message: { senderRole?: string }) => {
      if (active && message.senderRole !== 'Reader') {
        setSupportUnreadCount((count) => count + 1);
      }
    });
    const notificationHub = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/notifications`, {
        accessTokenFactory: () => accessToken,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
    notificationHub.on('NotificationCreated', (notice: InboxNotice) => {
      if (!active) return;
      setNotificationUnreadCount((count) => count + (notice.isRead ? 0 : 1));
      if (notificationPage === 1) {
        setReaderNotifications((current) => [notice, ...current.filter((item) => item.id !== notice.id)].slice(0, 10));
      }
    });
    notificationHub.on('BorrowStatusUpdated', (payload: {
      status?: string;
      bookTitle?: string;
      barcode?: string;
      pickupAt?: string;
      acceptedAt?: string;
      librarianName?: string;
      borrowDate?: string;
      dueDate?: string;
      message?: string;
    }) => {
      if (!active) return;
      window.dispatchEvent(new Event('reader-circulation-updated'));
      if (payload.message) {
        showToast({ type: 'error', title: 'Yêu cầu mượn sách', message: payload.message });
        return;
      }
      const dateTime = (value?: string) => value
        ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
        : '';
      if (payload.status === 'Approved') {
        showToast({
          type: 'success',
          title: 'Thủ thư đã tiếp nhận yêu cầu',
          message: `${payload.librarianName || 'Thủ thư'} tiếp nhận lúc ${dateTime(payload.acceptedAt)}. Lịch nhận: ${dateTime(payload.pickupAt)}.`,
        });
      } else if (payload.status === 'Borrowed') {
        showToast({
          type: 'success',
          title: 'Đã hoàn tất mượn sách',
          message: `“${payload.bookTitle || 'Sách'}” · ${payload.barcode || ''}. Bắt đầu: ${dateTime(payload.borrowDate)}. Hạn trả: ${dateTime(payload.dueDate)}.`,
        });
      } else if (payload.status === 'Rejected') {
        showToast({ type: 'error', title: 'Yêu cầu mượn đã bị hủy', message: 'Bản sao đã được trả về kho.' });
      }
    });
    notificationHub.on('ReservationReady', (payload: { bookId?: string; bookTitle?: string; message?: string }) => {
      if (!active) return;
      window.dispatchEvent(new CustomEvent('reader-reservation-ready', { detail: payload }));
      showToast({
        type: 'success',
        title: 'Sách bạn đặt trước đã sẵn sàng',
        message: payload.message || `“${payload.bookTitle || 'Sách'}” đã sẵn sàng. Hãy gửi yêu cầu mượn trong thời gian giữ.`,
      });
    });
    notificationHub.onreconnected(() => void loadReaderNotifications());
    const startHub = async (hub: HubConnection, label: string, attempt = 0) => {
      try {
        await hub.start();
        if (!active) {
          await hub.stop();
          return;
        }
        await loadSupportUnreadCount();
      } catch (caught: unknown) {
        if (active && attempt === 0) {
          showToast({
            type: 'error',
            title: `Không kết nối được ${label}`,
            message: caught instanceof Error ? caught.message : 'Hệ thống sẽ thử lại khi bạn tải trang.',
          });
        }
        if (active && hub.state === HubConnectionState.Disconnected) {
          retryTimers.push(window.setTimeout(() => void startHub(hub, label, attempt + 1), Math.min(30_000, 5_000 * (attempt + 1))));
        }
      }
    };
    window.addEventListener('reader-support-read', clearSupportUnreadCount);
    void loadSupportUnreadCount();
    void startHub(supportHub, 'tin nhắn hỗ trợ');
    void startHub(notificationHub, 'thông báo realtime');
    return () => {
      active = false;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('reader-support-read', clearSupportUnreadCount);
      for (const hub of [supportHub, notificationHub]) {
        if (hub.state === HubConnectionState.Connected || hub.state === HubConnectionState.Reconnecting) void hub.stop();
      }
    };
  }, [accessToken, loadReaderNotifications, notificationPage, showToast, user?.role]);

  const closeMenu = () => {
    setIsMenuOpen(false);
    setIsCategoriesOpen(false);
    setIsUserMenuOpen(false);
  };
  const defaultSearch = (
    <form className="annual-search" action="/books" method="get" role="search" aria-label="Tìm sách trong thư viện">
      <Search size={22} aria-hidden="true" />
      <label className="sr-only" htmlFor="annual-navbar-book-search">Tìm sách</label>
      <input id="annual-navbar-book-search" name="q" placeholder="Tên sách, tác giả, ISBN hoặc điều bạn muốn học" />
      <button type="submit">Tìm trong thư viện</button>
    </form>
  );

  const handleLogout = () => {
    setSupportUnreadCount(0);
    logout();
    showToast({ type: 'success', title: 'Đăng xuất thành công', message: 'Bạn đã đăng xuất khỏi SmartLibrary.' });
    closeMenu();
  };

  return (
    <header className="annual-header">
      <div className="annual-frame annual-header-inner">
        <Link to="/" className="annual-brand" aria-label="SmartLibrary - Trang chủ">
          <img src={smartLibraryLogo} alt="SmartLibrary" />
        </Link>
        <div className="annual-header-search">{searchSlot ?? defaultSearch}</div>
        {isAuthenticated && user ? (
          <div className="annual-account annual-header-actions">
            {user.role === 'Admin' && <Link to="/admin" onClick={closeMenu}><ShieldCheck size={16} /> Quản trị</Link>}
            {user.role === 'Librarian' && <Link to="/librarian" onClick={closeMenu}><BookOpen size={16} /> Thủ thư</Link>}
            {user.role === 'Reader' && (
              <div ref={notificationsRef} className={`annual-reader-notifications${notificationsOpen ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="annual-reader-notifications-trigger"
                  aria-label="Thông báo"
                  aria-expanded={notificationsOpen}
                  onClick={toggleNotifications}
                >
                  <Bell size={19} strokeWidth={1.9} aria-hidden="true" />
                  {notificationUnreadCount > 0 && (
                    <span>{notificationUnreadCount > 9
                      ? '9+'
                      : notificationUnreadCount}</span>
                  )}
                </button>
                {notificationsOpen && (
                  <section className="annual-reader-notifications-popover" aria-label="Thông báo độc giả">
                    <header>
                      <strong>Thông báo</strong>
                      <span>Cập nhật gần đây</span>
                    </header>
                    {notificationError && <p className="annual-reader-notifications-error" role="alert">{notificationError}</p>}
                    {notificationsLoading && !readerNotifications.length ? (
                      <p className="annual-reader-notifications-empty">Đang tải thông báo...</p>
                    ) : !readerNotifications.length ? (
                      <p className="annual-reader-notifications-empty">Chưa có thông báo.</p>
                    ) : readerNotifications.map((notice) => {
                      const wasUnread = newlySeenNotificationIds.has(notice.id);
                      const content = (
                        <>
                          <span className="annual-reader-notification-status" aria-hidden="true" />
                          <div>
                          <strong>{notice.title}</strong>
                          <span>{notice.message}</span>
                          <small>{new Date(notice.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</small>
                          </div>
                        </>
                      );
                      return notice.href ? (
                        <Link
                          className={`annual-reader-notification-item${wasUnread ? ' is-unread' : ''}`}
                          key={notice.id}
                          to={notice.href}
                          onClick={closeNotifications}
                        >
                          {content}
                        </Link>
                      ) : (
                        <article className={`annual-reader-notification-item${wasUnread ? ' is-unread' : ''}`} key={notice.id}>
                          {content}
                        </article>
                      );
                    })}
                    {notificationTotalPages > 1 && (
                      <footer className="annual-reader-notifications-pagination">
                        <button type="button" disabled={notificationPage <= 1} onClick={() => setNotificationPage((page) => page - 1)}>Trước</button>
                        <span>{notificationPage}/{notificationTotalPages}</span>
                        <button type="button" disabled={notificationPage >= notificationTotalPages} onClick={() => setNotificationPage((page) => page + 1)}>Sau</button>
                      </footer>
                    )}
                  </section>
                )}
              </div>
            )}
            <div
              className={`annual-user-menu${isUserMenuOpen ? ' is-open' : ''}`}
              ref={userMenuRef}
              onMouseEnter={() => setIsUserMenuOpen(true)}
              onMouseLeave={() => setIsUserMenuOpen(false)}
              onFocus={() => setIsUserMenuOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setIsUserMenuOpen(false);
              }}
            >
              <button
                type="button"
                className="annual-user-trigger"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                onClick={() => setIsUserMenuOpen((open) =>
                  window.matchMedia('(hover: hover) and (pointer: fine)').matches ? true : !open,
                )}
              >
                {user.avatarUrl
                  ? <img className="annual-user-avatar" src={user.avatarUrl} alt="" />
                  : <span className="annual-user-avatar annual-user-avatar--fallback"><UserRound size={17} /></span>}
                <span className="annual-user-name">{user.fullName || user.email}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <div className="annual-user-popover" role="menu" aria-label="Menu tài khoản">
                <Link to="/profile" role="menuitem" onClick={closeMenu}><UserRound size={16} /> Hồ sơ cá nhân</Link>
                {user.role === 'Reader' && (
                  <>
                    <Link to="/support" role="menuitem" onClick={closeMenu}>
                      <CircleHelp size={16} />
                      <span className="annual-support-menu-label">Hỗ trợ</span>
                      {supportUnreadCount > 0 && (
                        <span className="annual-support-unread" aria-label={`${supportUnreadCount} tin nhắn hỗ trợ chưa đọc`}>
                          {supportUnreadCount > 99 ? '99+' : supportUnreadCount}
                        </span>
                      )}
                    </Link>
                    <Link to="/history" role="menuitem" onClick={closeMenu}><History size={16} /> Mượn & trả của tôi</Link>
                    <Link to="/favorites" role="menuitem" onClick={closeMenu}><Heart size={16} /> Sách yêu thích</Link>
                  </>
                )}
                <button type="button" role="menuitem" onClick={handleLogout}><LogOut size={16} /> Đăng xuất</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="annual-auth annual-header-actions">
            <Link to="/login" onClick={closeMenu}>Đăng nhập</Link>
            <Link to="/register" className="annual-action" onClick={closeMenu}>Đăng ký</Link>
          </div>
        )}
        <button
          type="button"
          className="annual-menu-toggle"
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? 'Đóng menu' : 'Mở menu'}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X /> : <Menu />}
        </button>
      </div>
      <div className="annual-frame annual-nav-row">
        <nav className={`annual-nav${isMenuOpen ? ' is-open' : ''}`} aria-label="Điều hướng chính">
          <div className={`annual-nav-dropdown${isCategoriesOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              aria-expanded={isCategoriesOpen}
              onClick={() => setIsCategoriesOpen((open) => !open)}
            >
              Danh mục <ChevronDown size={15} aria-hidden="true" />
            </button>
            <div className="annual-nav-submenu">
              {categoriesQuery.isPending && <span className="annual-nav-feedback">Đang tải danh mục…</span>}
              {categoriesQuery.isError && <span className="annual-nav-feedback" role="alert">Không tải được danh mục.</span>}
              {!categoriesQuery.isPending && !categoriesQuery.isError && categories.map((category) => (
                <Link key={category.id} to={`/books?category=${encodeURIComponent(category.id)}`} onClick={closeMenu}>
                  {category.name}
                </Link>
              ))}
              {!categoriesQuery.isPending && !categoriesQuery.isError && categories.length === 0 && (
                <span className="annual-nav-feedback">Chưa có danh mục sách.</span>
              )}
            </div>
          </div>
          <Link to="/books" aria-current={activeSection === 'catalog' ? 'page' : undefined} onClick={closeMenu}>Khám phá sách</Link>
          {user?.role === 'Reader' && <Link to="/favorites" onClick={closeMenu}><Heart size={15} aria-hidden="true" /> Yêu thích</Link>}
          <Link to="/news" aria-current={activeSection === 'news' ? 'page' : undefined} onClick={closeMenu}>Tin tức</Link>
          <a href="/#library" onClick={closeMenu}>Thư viện</a>
        </nav>
      </div>
    </header>
  );
};

export default HomeNavbar;
