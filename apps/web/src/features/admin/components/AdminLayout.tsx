import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  ClipboardList,
  BookOpenCheck,
  Boxes,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import smartLibraryLogo from '../../../assets/figma/auth-logo-fpt.png';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import './AdminLayout.css';
import './AdminPageTypography.css';

const navigation = [
  { label: 'Tổng quan', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Quản lý người dùng', to: '/admin/users', icon: UsersRound, end: false },
  { label: 'Quản lý chính sách', to: '/admin/policies', icon: FileText, end: false },
  { label: 'Quản lý quy định', to: '/admin/regulations', icon: ShieldCheck, end: false },
  { label: 'Thống kê & báo cáo', to: '/admin/reports', icon: ChartNoAxesCombined, end: false },
  { label: 'Cấu hình AI', to: '/admin/ai-settings', icon: Bot, end: false },
];

const reportNavigation = [
  { label: 'Theo dõi giao việc', to: '/admin/reports/assignments', icon: ClipboardList },
  { label: 'Hoạt động thư viện', to: '/admin/reports/activity', icon: BookOpenCheck },
  { label: 'Tài chính', to: '/admin/reports/finance', icon: CircleDollarSign },
  { label: 'Kho sách', to: '/admin/reports/collection', icon: Boxes },
  { label: 'Báo cáo định kỳ', to: '/admin/reports/periodic', icon: CalendarDays },
  { label: 'Thư viện báo cáo', to: '/admin/reports/library', icon: FileText },
  { label: 'Quản lý mẫu báo cáo', to: '/admin/reports/templates', icon: FileText },
];

const EXPAND_DELAY_MS = 140;

export const AdminLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(true);
  const [reportsMenuOpen, setReportsMenuOpen] = useState(false);
  const expandTimerRef = useRef<number | null>(null);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const isItemActive = (to: string, end?: boolean) => {
    if (to === '/admin/reports') {
      return location.pathname === '/admin/reports' || location.pathname.startsWith('/admin/reports/');
    }
    return end ? location.pathname === to : location.pathname.startsWith(to);
  };

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

  const handleLogout = () => {
    logout();
    showToast({ type: 'success', title: 'Đăng xuất thành công', message: 'Bạn đã đăng xuất khỏi SmartLibrary.' });
    navigate('/login');
  };

  const collapsed = !railExpanded;
  const showTooltips = collapsed && !mobileOpen;

  const sidebarClassName = [
    'admin-sidebar',
    mobileOpen ? 'admin-sidebar-open' : '',
    railExpanded ? 'admin-sidebar--expanded' : 'admin-sidebar--collapsed',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="admin-shell">
      {mobileOpen && (
        <button
          type="button"
          className="admin-mobile-scrim"
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
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
        <div className="admin-brand-row">
          <Link to="/admin" className="admin-brand" title="SmartLibrary">
            <img src={smartLibraryLogo} alt="" className="admin-brand-logo" />
            <span className="admin-brand-text">
              <strong>SmartLibrary</strong>
              <small>QUẢN TRỊ HỆ THỐNG</small>
            </span>
          </Link>
          <button
            type="button"
            className="admin-sidebar-close"
            aria-label="Đóng menu"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {!hoverCapable && (
          <button
            type="button"
            className="admin-rail-toggle"
            aria-label={railExpanded ? 'Thu gọn menu' : 'Mở rộng menu'}
            aria-expanded={railExpanded}
            onClick={() => setRailExpanded((v) => !v)}
          >
            {railExpanded ? <PanelLeft size={18} /> : <ChevronRight size={18} />}
            <span className="admin-rail-toggle-label">{railExpanded ? 'Thu gọn' : 'Mở rộng'}</span>
          </button>
        )}

        <div className="admin-nav-caption">MENU CHÍNH</div>
        <nav className="admin-navigation" aria-label="Điều hướng quản trị">
          {navigation.map(({ label, to, icon: Icon, end }) => {
            const active = isItemActive(to, end);
            return <div className="admin-nav-group" key={to}>
              {to === '/admin/reports' ? (
                <button
                  type="button"
                  title={showTooltips ? label : undefined}
                  data-tooltip={label}
                  aria-expanded={reportsMenuOpen}
                  aria-controls="admin-report-subnavigation"
                  onClick={() => setReportsMenuOpen((open) => !open)}
                  className={`admin-nav-link admin-nav-toggle${active ? ' admin-nav-link-active' : ''}`}
                >
                  <Icon size={20} strokeWidth={1.9} className="admin-nav-icon" />
                  <span className="admin-nav-label">{label}</span>
                  <ChevronDown size={16} className={`admin-nav-chevron${reportsMenuOpen ? ' admin-nav-chevron-open' : ''}`} />
                </button>
              ) : (
                <NavLink
                  to={to}
                  end={end}
                  title={showTooltips ? label : undefined}
                  data-tooltip={label}
                  onClick={() => setMobileOpen(false)}
                  className={`admin-nav-link${active ? ' admin-nav-link-active' : ''}`}
                >
                  <Icon size={20} strokeWidth={1.9} className="admin-nav-icon" />
                  <span className="admin-nav-label">{label}</span>
                </NavLink>
              )}
              {to === '/admin/reports' && <div id="admin-report-subnavigation" className={`admin-subnavigation${reportsMenuOpen ? ' admin-subnavigation-open' : ''}`} aria-label="Các mục thống kê và báo cáo">
                {reportNavigation.map(({ label: reportLabel, to: reportTo, icon: ReportIcon }) => (
                  <NavLink
                    key={reportTo}
                    to={reportTo}
                    title={showTooltips ? reportLabel : undefined}
                    data-tooltip={reportLabel}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive: reportActive }) => `admin-subnav-link${reportActive ? ' admin-subnav-link-active' : ''}`}
                  >
                    <ReportIcon size={16} strokeWidth={1.9} className="admin-subnav-icon" />
                    <span className="admin-nav-label">{reportLabel}</span>
                  </NavLink>
                ))}
              </div>}
            </div>;
          })}
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-sidebar-help">
            <span className="admin-help-icon"><BookOpen size={18} /></span>
            <div className="admin-help-copy">
              <strong>SmartLibrary</strong>
              <p>Quản lý thư viện trong một không gian thống nhất.</p>
            </div>
          </div>
          <button
            type="button"
            className="admin-logout-button"
            onClick={handleLogout}
            title={showTooltips ? 'Đăng xuất' : undefined}
            data-tooltip="Đăng xuất"
          >
            <LogOut size={18} className="admin-nav-icon" />
            <span className="admin-nav-label">Đăng xuất</span>
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-menu-button"
            aria-label="Mở menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="admin-topbar-actions">
            <button
              type="button"
              className="admin-icon-button"
              aria-label="Mở danh sách báo cáo"
              title="Mở danh sách báo cáo"
              onClick={() => navigate('/admin/reports')}
            >
              <Bell size={19} />
            </button>
            <span className="admin-topbar-divider" />
            <Link className="admin-profile" to="/admin/profile" aria-label="Mở hồ sơ cá nhân">
              {user?.avatarUrl
                ? <img className="admin-avatar admin-avatar-image" src={user.avatarUrl} alt="" />
                : <div className="admin-avatar">{user?.fullName?.trim().charAt(0).toUpperCase() || 'A'}</div>}
              <div className="admin-profile-copy">
                <strong>{user?.fullName || 'Quản trị viên'}</strong>
                <span>Quản trị viên</span>
              </div>
              <ChevronDown size={16} className="admin-profile-chevron" />
            </Link>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
