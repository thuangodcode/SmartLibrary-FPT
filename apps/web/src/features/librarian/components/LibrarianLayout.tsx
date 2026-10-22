import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
  Search,
  Users,
  Wallet,
  X,
  Check,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import smartLibraryLogo from '../../../assets/figma/auth-logo-fpt.png';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import './LibrarianLayout.css';

const circulationChildren = [
  { label: 'Mượn sách', to: '/librarian/circulation/loans', icon: BookOpen, end: false },
  { label: 'Trả sách', to: '/librarian/circulation/return', icon: RotateCcw, end: false },
  { label: 'Quá hạn', to: '/librarian/circulation/overdue', icon: Clock3, end: false },
  { label: 'Phí phạt', to: '/librarian/circulation/fines', icon: Wallet, end: false },
];

const navigation = [
  { label: 'Tổng quan', to: '/librarian', icon: LayoutDashboard, end: true },
  { label: 'Duyệt tài khoản', to: '/librarian/registrations', icon: FileCheck, end: false, hasBadge: true },
  { label: 'Quản lý sách', to: '/librarian/books', icon: BookOpen, end: false },
  { label: 'Quản lý dịch vụ', to: '/librarian/circulation', icon: RotateCcw, end: false, children: circulationChildren },
  { label: 'Quản lý độc giả', to: '/librarian/readers', icon: Users, end: false },
  { label: 'Quản lý báo cáo', to: '/librarian/reports', icon: ChartNoAxesCombined, end: false },
];

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const [circulationOpen, setCirculationOpen] = useState(true);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [decisionNotices, setDecisionNotices] = useState<ReportDecisionNotice[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<string[]>([]);
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const logout = useAuthStore((state) => state.logout);
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = circulationChildren.find((item) => item.end
    ? location.pathname === item.to
    : location.pathname.startsWith(item.to))?.label
    ?? navigation.find((item) => item.end
      ? location.pathname === item.to
      : location.pathname.startsWith(item.to) && item.to !== '/librarian/circulation')?.label
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

      <aside className={`lib-sidebar${sidebarOpen ? ' lib-sidebar-open' : ''}`}>
        <div className="lib-brand-row">
          <Link to="/librarian" className="lib-brand">
            <img src={smartLibraryLogo} alt="" className="lib-brand-logo" />
            <span>
              <strong>SmartLibrary</strong>
              <small>THƯ VIỆN THÔNG MINH – ĐH FPT TP.HCM</small>
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

        <div className="lib-nav-caption">MENU CHÍNH</div>
        <nav className="lib-navigation" aria-label="Điều hướng thủ thư">
          {navigation.map(({ label, to, icon: Icon, end, hasBadge, children }) => (
            children ? (
              <div className="lib-nav-group" key={to}>
                <button
                  type="button"
                  className={`lib-nav-link lib-nav-parent${location.pathname.startsWith('/librarian/circulation') ? ' lib-nav-link-active' : ''}`}
                  onClick={() => setCirculationOpen((open) => !open)}
                >
                  <Icon size={19} strokeWidth={1.9} />
                  <span>{label}</span>
                  {circulationOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {circulationOpen && children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    end={child.end}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) => `lib-nav-link lib-nav-child${isActive ? ' lib-nav-link-active' : ''}`}
                  >
                    <child.icon size={16} strokeWidth={1.9} />
                    <span>{child.label}</span>
                  </NavLink>
                ))}
              </div>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `lib-nav-link${isActive ? ' lib-nav-link-active' : ''}`}
              >
                <Icon size={19} strokeWidth={1.9} />
                <span>{label}</span>
                {hasBadge && (pendingCount ?? 0) > 0 && (
                  <span className="lib-nav-badge">{pendingCount}</span>
                )}
              </NavLink>
            )
          ))}
        </nav>

        <div className="lib-sidebar-bottom">
          <div className="lib-sidebar-help">
            <span className="lib-help-icon"><BookOpen size={18} /></span>
            <strong>SmartLibrary</strong>
            <p>Quản lý thư viện trong một không gian thống nhất.</p>
          </div>
          <button type="button" className="lib-logout-button" onClick={handleLogout}>
            <LogOut size={17} />
            <span>Đăng xuất</span>
          </button>
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
            className="lib-header-search"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(`/librarian/circulation/loans?q=${encodeURIComponent(headerSearch.trim())}`);
            }}
          >
            <Search size={16} />
            <input
              value={headerSearch}
              onChange={(event) => setHeaderSearch(event.target.value)}
              placeholder="Tìm sách, mã phiếu, tên bạn đọc..."
            />
          </form>
          <div className="lib-topbar-actions">
            <details className="lib-notification-menu">
              <summary className="lib-icon-button" aria-label={`Thông báo${unreadDecisionCount ? `, ${unreadDecisionCount} thông báo chưa xem` : ''}`}>
                <Bell size={19} />
                {unreadDecisionCount > 0 && <span className="lib-notification-count">{unreadDecisionCount > 9 ? '9+' : unreadDecisionCount}</span>}
              </summary>
              <section className="lib-notification-popover" aria-label="Thông báo báo cáo">
                <header><strong>Thông báo báo cáo</strong><span>{unreadDecisionCount} chưa xem</span></header>
                {notificationError && <p className="lib-notification-error">{notificationError}</p>}
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
                )) : !notificationError ? (
                  <p className="lib-notification-empty">Chưa có thông báo duyệt báo cáo.</p>
                ) : null}
              </section>
            </details>
            <span className="lib-topbar-divider" />
            <div className="lib-profile">
              <div className="lib-avatar">{user?.fullName?.trim().charAt(0).toUpperCase() || 'T'}</div>
              <div className="lib-profile-copy">
                <strong>{user?.fullName || 'Thủ thư SmartLibrary'}</strong>
                <span>Quản lý thư viện</span>
              </div>
              <ChevronDown size={16} className="lib-profile-chevron" />
            </div>
          </div>
        </header>

        <main className="lib-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
