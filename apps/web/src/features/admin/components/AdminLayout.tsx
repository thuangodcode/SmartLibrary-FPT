import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeft,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import smartLibraryLogo from '../../../assets/figma/auth-logo-fpt.png';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import './AdminLayout.css';

const navigation = [
  { label: 'Tổng quan', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Quản lý người dùng', to: '/admin/users', icon: UsersRound, end: false },
  { label: 'Quản lý sách', to: '/admin/books', icon: BookOpen, end: false },
  { label: 'Chính sách thư viện', to: '/admin/policies', icon: ShieldCheck, end: false },
  { label: 'Cấu hình AI', to: '/admin/ai-settings', icon: Bot, end: false },
  { label: 'Thống kê & báo cáo', to: '/admin/reports', icon: ChartNoAxesCombined, end: false },
];

const EXPAND_DELAY_MS = 140;

export const AdminLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(true);
  const expandTimerRef = useRef<number | null>(null);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = navigation.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  )?.label ?? 'Tổng quan';

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
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={showTooltips ? label : undefined}
              data-tooltip={label}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`}
            >
              <Icon size={20} strokeWidth={1.9} className="admin-nav-icon" />
              <span className="admin-nav-label">{label}</span>
            </NavLink>
          ))}
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
          <div className="admin-breadcrumb">
            <span>Quản trị</span>
            <span className="admin-breadcrumb-separator">/</span>
            <strong>{currentPage}</strong>
          </div>
          <div className="admin-topbar-actions">
            <button type="button" className="admin-icon-button" aria-label="Thông báo">
              <Bell size={19} />
              <span className="admin-notification-dot" />
            </button>
            <span className="admin-topbar-divider" />
            <div className="admin-profile">
              <div className="admin-avatar">{user?.fullName?.trim().charAt(0).toUpperCase() || 'A'}</div>
              <div className="admin-profile-copy">
                <strong>{user?.fullName || 'Quản trị viên'}</strong>
                <span>Quản trị viên</span>
              </div>
              <ChevronDown size={16} className="admin-profile-chevron" />
            </div>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
