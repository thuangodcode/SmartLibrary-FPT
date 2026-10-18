import { useState } from 'react';
import {
  Bell,
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import smartLibraryLogo from '../../../assets/figma/auth-logo-fpt.png';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminLayout.css';

const navigation = [
  { label: 'Tổng quan', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Quản lý người dùng', to: '/admin/users', icon: UsersRound, end: false },
  { label: 'Quản lý sách', to: '/admin/books', icon: BookOpen, end: false },
  { label: 'Chính sách thư viện', to: '/admin/policies', icon: ShieldCheck, end: false },
  { label: 'Cấu hình AI', to: '/admin/ai-settings', icon: Bot, end: false },
  { label: 'Thống kê & báo cáo', to: '/admin/reports', icon: ChartNoAxesCombined, end: false },
];

export const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = navigation.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  )?.label ?? 'Tổng quan';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="admin-shell">
      {sidebarOpen && (
        <button
          className="admin-mobile-scrim"
          aria-label="Đóng menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`admin-sidebar${sidebarOpen ? ' admin-sidebar-open' : ''}`}>
        <div className="admin-brand-row">
          <Link to="/admin" className="admin-brand">
            <img src={smartLibraryLogo} alt="" className="admin-brand-logo" />
            <span>
              <strong>SmartLibrary</strong>
              <small>QUẢN TRỊ HỆ THỐNG</small>
            </span>
          </Link>
          <button
            type="button"
            className="admin-sidebar-close"
            aria-label="Đóng menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="admin-nav-caption">MENU CHÍNH</div>
        <nav className="admin-navigation" aria-label="Điều hướng quản trị">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-sidebar-help">
            <span className="admin-help-icon"><BookOpen size={18} /></span>
            <strong>SmartLibrary</strong>
            <p>Quản lý thư viện trong một không gian thống nhất.</p>
          </div>
          <button type="button" className="admin-logout-button" onClick={handleLogout}>
            <LogOut size={17} />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-menu-button"
            aria-label="Mở menu"
            onClick={() => setSidebarOpen(true)}
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
