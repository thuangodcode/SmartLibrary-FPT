import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  Bookmark,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  Sparkles,
  KeyRound,
  RotateCcw,
  Search,
  Users,
  Wallet,
  X,
  Check,
  CircleHelp,
  MessagesSquare,
  LoaderCircle,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import smartLibraryLogo from '../../../assets/figma/auth-logo-fpt.png';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { listInboxNotices, markInboxNoticeRead, type InboxNotice } from '../notificationsApi';
import './LibrarianLayout.css';
import './LibrarianPageTypography.css';

const circulationChildren = [
  { label: 'Mượn sách', to: '/librarian/circulation/loans', icon: BookOpen, end: false },
  { label: 'Trả sách', to: '/librarian/circulation/return', icon: RotateCcw, end: false },
  { label: 'Đặt chỗ', to: '/librarian/circulation/reservations', icon: Bookmark, end: false },
  { label: 'Quá hạn & Sự cố', to: '/librarian/circulation/overdue', icon: Clock3, end: false },
  { label: 'Phí phạt', to: '/librarian/circulation/fines', icon: Wallet, end: false },
];

const supportChildren = [
  { label: 'Đơn tiếp nhận', to: '/librarian/support/requests', icon: CircleHelp, end: true },
  { label: 'Phản hồi đơn', to: '/librarian/support/replies', icon: MessagesSquare, end: true },
];

const navigation = [
  { label: 'Tổng quan', to: '/librarian', icon: LayoutDashboard, end: true },
  { label: 'Quản lý dịch vụ', to: '/librarian/circulation', icon: RotateCcw, end: false, children: circulationChildren },
  { label: 'Sách & Biên mục', to: '/librarian/books', icon: BookOpen, end: false },
  { label: 'Duyệt người đọc', to: '/librarian/registrations', icon: FileCheck, end: false },
  { label: 'Độc giả', to: '/librarian/readers', icon: Users, end: false },
  { label: 'Hỗ trợ độc giả', to: '/librarian/support', icon: CircleHelp, end: false, children: supportChildren },
  { label: 'Tin tức & Thông báo', to: '/librarian/news', icon: Bell, end: false },
  { label: 'Thống kê & báo cáo', to: '/librarian/reports', icon: ChartNoAxesCombined, end: false },
  { label: 'Thiết lập AI nghiệp vụ', to: '/librarian/ai-settings', icon: Sparkles, end: false },
];

const EXPAND_DELAY_MS = 140;

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface ReportDecisionNotice {
  id: string;
  name: string;
  templateName: string;
  reportId: string | null;
  lastReportStatus: string | null;
  lastReviewComment: string | null;
}

export const LibrarianLayout: React.FC = () => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(true);
  const [headerSearch, setHeaderSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [readerSuggestions, setReaderSuggestions] = useState<Array<{ id: string; label: string; studentId?: string; email?: string }>>([]);
  const [bookSuggestions, setBookSuggestions] = useState<Array<{ id: string; label: string; code?: string; availableCopies?: number; coverImageUrl?: string | null }>>([]);
  const searchContainerRef = useRef<HTMLFormElement>(null);
  const [circulationOpen, setCirculationOpen] = useState(true);
  const [supportOpen, setSupportOpen] = useState(() => location.pathname.startsWith('/librarian/support'));
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [decisionNotices, setDecisionNotices] = useState<ReportDecisionNotice[]>([]);
  const [inboxNotices, setInboxNotices] = useState<InboxNotice[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<string[]>([]);
  const profileMenuRef = useRef<HTMLDetailsElement>(null);
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const logout = useAuthStore((state) => state.logout);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const hiddenModuleLabels: Record<string, string> = {
    '/librarian/loans': 'Mượn – Trả',
    '/librarian/fines': 'Quá hạn & Phí phạt',
  };
  const expandTimerRef = useRef<number | null>(null);
  const showTooltips = !railExpanded && !sidebarOpen;
  const sidebarClassName = [
    'lib-sidebar',
    sidebarOpen ? 'lib-sidebar-open' : '',
    railExpanded ? 'lib-sidebar--expanded' : 'lib-sidebar--collapsed',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setHoverCapable(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => () => {
    if (expandTimerRef.current !== null) window.clearTimeout(expandTimerRef.current);
  }, []);

  const clearExpandTimer = () => {
    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = headerSearch.trim();
    if (!trimmed) {
      setReaderSuggestions([]);
      setBookSuggestions([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const token = useAuthStore.getState().accessToken;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const [resReaders, resBooks] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/circulation/reservation-reader-options?search=${encodeURIComponent(trimmed)}`, {
            headers,
            signal: controller.signal,
          }),
          fetch(`${API_BASE_URL}/api/v1/circulation/reservation-book-options?search=${encodeURIComponent(trimmed)}`, {
            headers,
            signal: controller.signal,
          }),
        ]);

        if (resReaders.ok) {
          const jsonR = await resReaders.json();
          if (jsonR.success && Array.isArray(jsonR.data)) {
            setReaderSuggestions(jsonR.data.slice(0, 5));
          }
        }
        if (resBooks.ok) {
          const jsonB = await resBooks.json();
          if (jsonB.success && Array.isArray(jsonB.data)) {
            setBookSuggestions(jsonB.data.slice(0, 5).map((book: { id: string; title?: string; code?: string; availableCopies?: number; coverImageUrl?: string | null }) => ({
              id: book.id,
              label: book.title || '',
              code: book.code,
              availableCopies: book.availableCopies,
              coverImageUrl: book.coverImageUrl,
            })));
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // ignore
        }
      } finally {
        setSearchLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [headerSearch]);

  const currentPage = location.pathname === '/librarian/profile'
    ? 'Hồ sơ cá nhân'
    : hiddenModuleLabels[location.pathname]
      ?? circulationChildren.find((item) => location.pathname.startsWith(item.to))?.label
      ?? supportChildren.find((item) => location.pathname.startsWith(item.to))?.label
      ?? navigation.find((item) =>
        item.end ? location.pathname === item.to
          : location.pathname.startsWith(item.to) && item.to !== '/librarian/circulation',
      )?.label
      ?? 'Tổng quan';

  const lastFetchRef = React.useRef<number>(0);
  React.useEffect(() => {
    const now = Date.now();
    // Do not refetch if fetched less than 20 seconds ago
    if (pendingCount !== null && now - lastFetchRef.current < 20000) {
      return;
    }
    lastFetchRef.current = now;

    const fetchPending = async () => {
      try {
        const token = useAuthStore.getState().accessToken;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE_URL}/api/v1/dashboard/stats`, { headers });
        const json = await res.json();
        if (json.success && json.data) {
          setPendingCount(json.data.pendingRegistrations);
        }
      } catch { /* silently ignore */ }
    };
    fetchPending();
  }, [location.pathname, pendingCount]);

  React.useEffect(() => {
    const storageKey = `smartlibrary:report-decisions:${user?.email ?? 'librarian'}`;
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        const parsed: unknown = saved ? JSON.parse(saved) : [];
        setDismissedNoticeIds(Array.isArray(parsed) && parsed.every((value): value is string => typeof value === 'string') ? parsed : []);
      } catch {
        setDismissedNoticeIds([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user?.email]);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    const fetchDecisions = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/librarian/reports/requests`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await parseApiResponse<ApiEnvelope<ReportDecisionNotice[]>>(response);
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.error || 'Không thể tải thông báo báo cáo.');
        }
        if (!cancelled) {
          setDecisionNotices(result.data.filter((item) =>
            item.lastReportStatus === 'Approved' || item.lastReportStatus === 'Rejected',
          ));
          setNotificationError(null);
        }
      } catch (caught) {
        if (!cancelled) setNotificationError(caught instanceof Error ? caught.message : 'Không thể tải thông báo báo cáo.');
      }
      try {
        const inbox = await listInboxNotices(accessToken);
        if (!cancelled) setInboxNotices(inbox);
      } catch {
        if (!cancelled) setInboxNotices([]);
      }
    };
    void fetchDecisions();
    const timer = window.setInterval(() => void fetchDecisions(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken]);

  const dismissDecision = (noticeId: string) => {
    const next = [...new Set([...dismissedNoticeIds, noticeId])];
    setDismissedNoticeIds(next);
    try {
      localStorage.setItem(`smartlibrary:report-decisions:${user?.email ?? 'librarian'}`, JSON.stringify(next));
    } catch {
      setNotificationError('Không thể lưu trạng thái đã xem của thông báo trên thiết bị này.');
    }
  };
  const unreadDecisionCount = decisionNotices.filter((notice) => !dismissedNoticeIds.includes(notice.id)).length;
  const unreadInboxCount = inboxNotices.filter((notice) => !notice.isRead).length;
  const unreadCount = unreadDecisionCount + unreadInboxCount;

  const dismissInbox = async (noticeId: string) => {
    if (!accessToken) return;
    try {
      await markInboxNoticeRead(accessToken, noticeId);
      setInboxNotices((current) => current.map((item) => (
        item.id === noticeId ? { ...item, isRead: true } : item
      )));
    } catch (caught) {
      setNotificationError(caught instanceof Error ? caught.message : 'Không đánh dấu được thông báo.');
    }
  };

  const handleLogout = () => {
    logout();
    showToast({ type: 'success', title: 'Đăng xuất thành công', message: 'Bạn đã đăng xuất khỏi SmartLibrary.' });
    navigate('/login');
  };

  return (
    <div className="lib-shell">
      {sidebarOpen && (
        <button
          className="lib-mobile-scrim"
          aria-label="Đóng menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={sidebarClassName}
        onMouseEnter={() => {
          if (!hoverCapable) return;
          clearExpandTimer();
          expandTimerRef.current = window.setTimeout(() => {
            setRailExpanded(true);
            expandTimerRef.current = null;
          }, EXPAND_DELAY_MS);
        }}
        onMouseLeave={() => {
          if (!hoverCapable) return;
          clearExpandTimer();
          setRailExpanded(false);
        }}
      >
        <div className="lib-brand-row">
          <Link to="/librarian" className="lib-brand" title="SmartLibrary">
            <img src={smartLibraryLogo} alt="" className="lib-brand-logo" />
            <span className="lib-brand-text">
              <strong>SmartLibrary</strong>
              <small>QUẢN TRỊ HỆ THỐNG</small>
            </span>
          </Link>
          <button
            type="button"
            className="lib-sidebar-close"
            aria-label="Đóng menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {!hoverCapable && (
          <button
            type="button"
            className="lib-rail-toggle"
            aria-label={railExpanded ? 'Thu gọn menu' : 'Mở rộng menu'}
            aria-expanded={railExpanded}
            onClick={() => setRailExpanded((expanded) => !expanded)}
          >
            {railExpanded ? <PanelLeft size={18} /> : <ChevronRight size={18} />}
            <span className="lib-rail-toggle-label">{railExpanded ? 'Thu gọn' : 'Mở rộng'}</span>
          </button>
        )}

        <div className="lib-nav-caption">MENU CHÍNH</div>
        <nav className="lib-navigation" aria-label="Điều hướng thủ thư">
          {navigation.map((item) => {
            const { label, to, icon: Icon, end, children } = item;
            const isSupportGroup = to === '/librarian/support';
            const groupOpen = isSupportGroup ? supportOpen : circulationOpen;
            const setGroupOpen = isSupportGroup ? setSupportOpen : setCirculationOpen;
            const groupActive = location.pathname.startsWith(to);
            return children ? (
              <div className="lib-nav-group" key={to}>
                <button
                  type="button"
                  title={showTooltips ? label : undefined}
                  data-tooltip={label}
                  aria-expanded={groupOpen}
                  className={`lib-nav-link lib-nav-parent${groupActive ? ' lib-nav-link-active' : ''}`}
                  onClick={() => setGroupOpen((open) => !open)}
                >
                  <Icon size={20} strokeWidth={1.9} className="lib-nav-icon" />
                  <span className="lib-nav-label">{label}</span>
                  <ChevronDown size={16} className={`lib-nav-chevron${groupOpen ? ' lib-nav-chevron-open' : ''}`} />
                </button>
                <div className={`lib-subnavigation${groupOpen ? ' lib-subnavigation-open' : ''}`}>
                  {children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end={child.end}
                      title={showTooltips ? child.label : undefined}
                      data-tooltip={child.label}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) => `lib-nav-link lib-nav-child${isActive ? ' lib-nav-link-active' : ''}`}
                    >
                      <child.icon size={16} strokeWidth={1.9} className="lib-nav-icon" />
                      <span className="lib-nav-label">{child.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={showTooltips ? label : undefined}
                data-tooltip={label}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `lib-nav-link${isActive ? ' lib-nav-link-active' : ''}`}
              >
                <Icon size={20} strokeWidth={1.9} className="lib-nav-icon" />
                <span className="lib-nav-label">{label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="lib-sidebar-bottom">
          <div className="lib-sidebar-help">
            <span className="lib-help-icon"><BookOpen size={18} /></span>
            <div className="lib-help-copy">
              <strong>SmartLibrary</strong>
              <p>Quản lý thư viện trong một không gian thống nhất.</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lib-main">
        <header className="lib-topbar">
          <button
            type="button"
            className="lib-menu-button"
            aria-label="Mở menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="lib-breadcrumb">
            <span>Thủ thư</span>
            <span className="lib-breadcrumb-separator">/</span>
            <strong>{currentPage}</strong>
          </div>
          <form
            ref={searchContainerRef}
            className="lib-header-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearchFocused(false);
              navigate(`/librarian/circulation/loans?q=${encodeURIComponent(headerSearch.trim())}`);
            }}
          >
            <Search size={16} />
            <input
              value={headerSearch}
              onChange={(event) => {
                setHeaderSearch(event.target.value);
                setSearchFocused(true);
              }}
              onFocus={() => setSearchFocused(true)}
              placeholder="Tìm sách, mã phiếu, tên bạn đọc..."
            />
            {headerSearch.trim().length > 0 && searchFocused && (
              <div className="lib-header-search-dropdown" role="listbox">
                {searchLoading && (
                  <div className="lib-header-search-state">
                    <LoaderCircle className="lib-readers-spin" size={15} />
                    <span>Đang tìm kiếm gợi ý...</span>
                  </div>
                )}

                {!searchLoading && readerSuggestions.length === 0 && bookSuggestions.length === 0 && (
                  <div className="lib-header-search-empty">
                    Không tìm thấy độc giả hoặc đầu sách khớp với "<strong>{headerSearch}</strong>"
                  </div>
                )}

                {readerSuggestions.length > 0 && (
                  <div className="lib-header-search-group">
                    <div className="lib-header-search-group-title">
                      <Users size={13} />
                      <span>ĐỘC GIẢ / BẠN ĐỌC</span>
                    </div>
                    {readerSuggestions.map((r) => (
                      <div
                        key={r.id}
                        role="option"
                        aria-selected={false}
                        className="lib-header-search-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchFocused(false);
                          navigate(`/librarian/readers/${r.id}`);
                        }}
                      >
                        <div className="lib-header-search-item-main">
                          <span className="lib-header-search-item-label">{r.label}</span>
                          {r.studentId && <span className="lib-search-tag">{r.studentId}</span>}
                        </div>
                        {r.email && <span className="lib-header-search-item-sub">{r.email}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {bookSuggestions.length > 0 && (
                  <div className="lib-header-search-group">
                    <div className="lib-header-search-group-title">
                      <BookOpen size={13} />
                      <span>ĐẦU SÁCH</span>
                    </div>
                    {bookSuggestions.map((b) => (
                      <div
                        key={b.id}
                        role="option"
                        aria-selected={false}
                        className="lib-header-search-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchFocused(false);
                          navigate(`/librarian/books?search=${encodeURIComponent(b.label)}`);
                        }}
                      >
                        {b.coverImageUrl
                          ? <img className="lib-search-book-cover" src={b.coverImageUrl} alt="" loading="lazy" />
                          : <span className="lib-search-book-cover lib-search-book-cover--empty"><BookOpen size={17} aria-hidden="true" /></span>}
                        <div className="lib-header-search-item-main">
                          <span className="lib-header-search-item-label">{b.label}</span>
                          {b.code && <span className="lib-search-tag">{b.code}</span>}
                        </div>
                        <div className="lib-header-search-item-sub">
                          {b.availableCopies !== undefined && (
                            b.availableCopies > 0 ? (
                              <span className="lib-search-avail-badge">Còn {b.availableCopies} cuốn khả dụng</span>
                            ) : (
                              <span className="lib-search-unavail-badge">Đã mượn hết</span>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  role="button"
                  tabIndex={0}
                  className="lib-header-search-footer"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearchFocused(false);
                    navigate(`/librarian/circulation/loans?q=${encodeURIComponent(headerSearch.trim())}`);
                  }}
                >
                  <Search size={14} />
                  <span>Tra cứu toàn bộ phiếu mượn/trả cho "<strong>{headerSearch}</strong>"</span>
                </div>
              </div>
            )}
          </form>
          <div className="lib-topbar-actions">
            <details className="lib-notification-menu">
              <summary className="lib-icon-button" aria-label={`Thông báo${unreadCount ? `, ${unreadCount} thông báo chưa xem` : ''}`}>
                <Bell size={19} />
                {unreadCount > 0 && <span className="lib-notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </summary>
              <section className="lib-notification-popover" aria-label="Thông báo">
                <header><strong>Thông báo</strong><span>{unreadCount} chưa xem</span></header>
                {notificationError && <p className="lib-notification-error">{notificationError}</p>}
                {inboxNotices.filter((notice) => notice.type === 'ai-key' || notice.type === 'ai-quota').slice(0, 6).map((notice) => (
                  <article className={notice.isRead ? 'is-read' : ''} key={notice.id}>
                    <div className="lib-notification-mark is-ai"><KeyRound size={15} /></div>
                    <div className="lib-notification-copy">
                      <strong>{notice.title}</strong>
                      <span>{notice.message}</span>
                      <Link to={notice.href || '/librarian/ai-settings'} onClick={() => { if (!notice.isRead) void dismissInbox(notice.id); }}>
                        Cập nhật API Key
                      </Link>
                    </div>
                    {!notice.isRead && (
                      <button type="button" onClick={() => void dismissInbox(notice.id)} aria-label="Đánh dấu đã xem"><Check size={15} /></button>
                    )}
                  </article>
                ))}
                {decisionNotices.length ? decisionNotices.slice(0, 8).map((notice) => (
                  <article className={dismissedNoticeIds.includes(notice.id) ? 'is-read' : ''} key={notice.id}>
                    <div className={`lib-notification-mark ${notice.lastReportStatus === 'Approved' ? 'is-approved' : 'is-rejected'}`}>
                      {notice.lastReportStatus === 'Approved' ? <Check size={15}/> : <X size={15}/>}
                    </div>
                    <div className="lib-notification-copy">
                      <strong>{notice.lastReportStatus === 'Approved' ? 'Báo cáo đã được duyệt' : 'Admin yêu cầu chỉnh sửa'}</strong>
                      <span>{notice.name || notice.templateName}</span>
                      {notice.lastReportStatus === 'Rejected' && notice.lastReviewComment && <p>{notice.lastReviewComment}</p>}
                      {notice.reportId && <Link to={`/librarian/reports/${notice.reportId}`}>Xem báo cáo</Link>}
                    </div>
                    {!dismissedNoticeIds.includes(notice.id) && (
                      <button type="button" onClick={() => dismissDecision(notice.id)} aria-label="Đánh dấu đã xem"><Check size={15}/></button>
                    )}
                  </article>
                )) : !notificationError && inboxNotices.length === 0 ? (
                  <p className="lib-notification-empty">Chưa có thông báo.</p>
                ) : null}
              </section>
            </details>
            <span className="lib-topbar-divider" />
            <details className="lib-profile-menu" ref={profileMenuRef}>
              <summary className="lib-profile" aria-label="Mở menu tài khoản">
                {user?.avatarUrl
                  ? <img className="lib-avatar lib-avatar-image" src={user.avatarUrl} alt="" />
                  : <div className="lib-avatar">{user?.fullName?.trim().charAt(0).toUpperCase() || 'T'}</div>}
                <div className="lib-profile-copy">
                  <strong>{user?.fullName || 'Thủ thư SmartLibrary'}</strong>
                  <span>Quản lý thư viện</span>
                </div>
                <ChevronDown size={16} className="lib-profile-chevron" />
              </summary>
              <div className="lib-profile-dropdown">
                <Link to="/librarian/profile" onClick={() => { if (profileMenuRef.current) profileMenuRef.current.open = false; }}>
                  <Users size={16} /> Hồ sơ cá nhân
                </Link>
                <button type="button" onClick={handleLogout}>
                  <LogOut size={16} /> Đăng xuất
                </button>
              </div>
            </details>
          </div>
        </header>

        <main className="lib-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
