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
  Users,
  Wallet,
  X,
  Check,
  CircleHelp,
  MessagesSquare,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const translatedLabels: Record<string, string> = {
    'Tổng quan': 'shell.librarianOverview', 'Quản lý dịch vụ': 'shell.services', 'Sách & Biên mục': 'shell.books',
    'Duyệt người đọc': 'shell.approvals', 'Độc giả': 'shell.readers', 'Hỗ trợ độc giả': 'shell.readerSupport',
    'Tin tức & Thông báo': 'shell.news', 'Thống kê & báo cáo': 'shell.librarianReports', 'Thiết lập AI nghiệp vụ': 'shell.librarianAi',
    'Mượn sách': 'shell.circulationLoans', 'Trả sách': 'shell.circulationReturn', 'Đặt chỗ': 'shell.reservations',
    'Quá hạn & Sự cố': 'shell.overdue', 'Phí phạt': 'shell.fines', 'Đơn tiếp nhận': 'shell.supportRequests',
    'Phản hồi đơn': 'shell.supportReplies', 'Hồ sơ cá nhân': 'shell.profile',
  };
  const translateLabel = (label: string) => translatedLabels[label] ? t(translatedLabels[label]) : label;
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(true);
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
    showToast({ type: 'success', title: t('header.logoutSuccess'), message: t('header.logoutMessage') });
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
            const displayLabel = translateLabel(label);
            const isSupportGroup = to === '/librarian/support';
            const groupOpen = isSupportGroup ? supportOpen : circulationOpen;
            const setGroupOpen = isSupportGroup ? setSupportOpen : setCirculationOpen;
            const groupActive = location.pathname.startsWith(to);
            return children ? (
              <div className="lib-nav-group" key={to}>
                <button
                  type="button"
                  title={showTooltips ? displayLabel : undefined}
                  data-tooltip={displayLabel}
                  aria-expanded={groupOpen}
                  className={`lib-nav-link lib-nav-parent${groupActive ? ' lib-nav-link-active' : ''}`}
                  onClick={() => setGroupOpen((open) => !open)}
                >
                  <Icon size={20} strokeWidth={1.9} className="lib-nav-icon" />
                  <span className="lib-nav-label">{displayLabel}</span>
                  <ChevronDown size={16} className={`lib-nav-chevron${groupOpen ? ' lib-nav-chevron-open' : ''}`} />
                </button>
                <div className={`lib-subnavigation${groupOpen ? ' lib-subnavigation-open' : ''}`}>
                  {children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end={child.end}
                      title={showTooltips ? translateLabel(child.label) : undefined}
                      data-tooltip={translateLabel(child.label)}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) => `lib-nav-link lib-nav-child${isActive ? ' lib-nav-link-active' : ''}`}
                    >
                      <child.icon size={16} strokeWidth={1.9} className="lib-nav-icon" />
                      <span className="lib-nav-label">{translateLabel(child.label)}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={showTooltips ? displayLabel : undefined}
                data-tooltip={displayLabel}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `lib-nav-link${isActive ? ' lib-nav-link-active' : ''}`}
              >
                <Icon size={20} strokeWidth={1.9} className="lib-nav-icon" />
                <span className="lib-nav-label">{displayLabel}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="lib-sidebar-bottom">
          <div className="lib-sidebar-help">
            <span className="lib-help-icon"><BookOpen size={18} /></span>
            <div className="lib-help-copy">
              <strong>SmartLibrary</strong>
              <p>{t('shell.libraryManagement')}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lib-main">
        <header className="lib-topbar">
          <button
            type="button"
            className="lib-menu-button"
            aria-label={t('header.openMenu')}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="lib-breadcrumb">
            <span>Thủ thư</span>
            <span className="lib-breadcrumb-separator">/</span>
            <strong>{translateLabel(currentPage)}</strong>
          </div>
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
                        {t('shell.updateApiKey')}
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
                      <strong>{notice.lastReportStatus === 'Approved' ? t('shell.reportApproved') : t('shell.reportRevision')}</strong>
                      <span>{notice.name || notice.templateName}</span>
                      {notice.lastReportStatus === 'Rejected' && notice.lastReviewComment && <p>{notice.lastReviewComment}</p>}
                      {notice.reportId && <Link to={`/librarian/reports/${notice.reportId}`}>{t('shell.viewReport')}</Link>}
                    </div>
                    {!dismissedNoticeIds.includes(notice.id) && (
                      <button type="button" onClick={() => dismissDecision(notice.id)} aria-label="Đánh dấu đã xem"><Check size={15}/></button>
                    )}
                  </article>
                )) : !notificationError && inboxNotices.length === 0 ? (
                  <p className="lib-notification-empty">{t('shell.noNotifications')}</p>
                ) : null}
              </section>
            </details>
            <span className="lib-topbar-divider" />
            <details className="lib-profile-menu" ref={profileMenuRef}>
              <summary className="lib-profile" aria-label={t('header.accountMenu')}>
                {user?.avatarUrl
                  ? <img className="lib-avatar lib-avatar-image" src={user.avatarUrl} alt="" />
                  : <div className="lib-avatar">{user?.fullName?.trim().charAt(0).toUpperCase() || 'T'}</div>}
                <div className="lib-profile-copy">
                  <strong>{user?.fullName || 'Thủ thư SmartLibrary'}</strong>
                  <span>{t('shell.libraryManagement')}</span>
                </div>
                <ChevronDown size={16} className="lib-profile-chevron" />
              </summary>
              <div className="lib-profile-dropdown">
                <Link to="/librarian/profile" onClick={() => { if (profileMenuRef.current) profileMenuRef.current.open = false; }}>
                  <Users size={16} /> {t('shell.profile')}
                </Link>
                <button type="button" onClick={handleLogout}>
                  <LogOut size={16} /> {t('header.logout')}
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
