import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  ChevronDown,
  FileCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import smartLibraryLogo from '../../../assets/figma/auth-logo-fpt.png';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { API_BASE_URL } from '../../../config';
import './LibrarianLayout.css';

const navigation = [
  { label: 'Tổng quan', to: '/librarian', icon: LayoutDashboard, end: true },
  { label: 'Duyệt tài khoản', to: '/librarian/registrations', icon: FileCheck, end: false, hasBadge: true },
  { label: 'Quản lý sách', to: '/librarian/books', icon: BookOpen, end: false },
  { label: 'Quản lý độc giả', to: '/librarian/readers', icon: Users, end: false },
  { label: 'Cài đặt', to: '/librarian/settings', icon: Settings, end: false },
];

export const LibrarianLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = navigation.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  )?.label ?? 'Tổng quan';

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

  const handleLogout = () => {
    logout();
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
              <small>THỦ THƯ</small>
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
          {navigation.map(({ label, to, icon: Icon, end, hasBadge }) => (
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
          <div className="lib-topbar-actions">
            <button type="button" className="lib-icon-button" aria-label="Thông báo">
              <Bell size={19} />
              <span className="lib-notification-dot" />
            </button>
            <span className="lib-topbar-divider" />
            <div className="lib-profile">
              <div className="lib-avatar">{user?.fullName?.trim().charAt(0).toUpperCase() || 'T'}</div>
              <div className="lib-profile-copy">
                <strong>{user?.fullName || 'Thủ thư'}</strong>
                <span>{user?.email || 'Thủ thư'}</span>
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
