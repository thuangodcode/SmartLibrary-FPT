import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Users, FileCheck, BarChart3, Settings, LogOut, Menu, X, Bell } from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';

const NAV_ITEMS = [
  { label: 'Tổng quan', icon: BarChart3, path: '/librarian' },
  { label: 'Duyệt tài khoản', icon: FileCheck, path: '/librarian/registrations' },
  { label: 'Quản lý sách', icon: BookOpen, path: '/librarian/books' },
  { label: 'Quản lý độc giả', icon: Users, path: '/librarian/readers' },
  { label: 'Cài đặt', icon: Settings, path: '/librarian/settings' },
];

export const LibrarianLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    const fetchPending = async () => {
      try {
        const token = useAuthStore.getState().accessToken;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('http://localhost:5278/api/v1/dashboard/stats', { headers });
        const json = await res.json();
        if (json.success && json.data) {
          setPendingCount(json.data.pendingRegistrations);
        }
      } catch {}
    };
    fetchPending();
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 ${sidebarOpen ? 'w-64' : 'w-20'} bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 flex flex-col`}>
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
            <BookOpen className="w-5 h-5" />
          </div>
          {sidebarOpen && (
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">SmartLibrary</p>
              <p className="text-[9px] font-semibold text-indigo-600 uppercase tracking-wider">Thủ Thư</p>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/librarian' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-indigo-600' : ''}`} />
                {sidebarOpen && <span>{item.label}</span>}
                {item.path === '/librarian/registrations' && sidebarOpen && (pendingCount ?? 0) > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 min-w-[20px] text-center rounded-full bg-rose-500 text-white text-[10px] font-bold">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info at Bottom */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-3">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {user ? getInitials(user.fullName) : 'LB'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user?.fullName || 'Thủ thư'}</p>
                <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
              </div>
              <button onClick={handleLogout} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex justify-center p-2 text-slate-400 hover:text-rose-500">
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              {NAV_ITEMS.find(n => location.pathname === n.path || (n.path !== '/librarian' && location.pathname.startsWith(n.path)))?.label || 'Tổng quan'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
