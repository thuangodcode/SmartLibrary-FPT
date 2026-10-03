import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Sun, Moon, Bell, Menu, X, ChevronDown, BookOpen, LogOut, User as UserIcon, Settings } from 'lucide-react';
import { useAuthStore } from '../../features/auth/store/useAuthStore';

interface CategoryNav {
  id: string;
  name: string;
  bookCount: number;
}

export const Header: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryNav[]>([]);

  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('http://localhost:5278/api/v1/categories')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setCategories(json.data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleLogout = async () => {
    try {
      const token = useAuthStore.getState().accessToken;
      await fetch('http://localhost:5278/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore */ }
    logout();
    navigate('/login');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        isScrolled
          ? 'glass-nav shadow-md py-3 border-b border-slate-200/60 dark:border-slate-800'
          : 'bg-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-2xl bg-ai-gradient flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="font-serif font-bold text-xl tracking-tight text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              Smart<span className="text-ai-gradient font-serif italic">Library</span>
            </span>
            <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest -mt-1">
              Capstone 2026
            </span>
          </div>
        </a>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <a href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            Trang Chủ
          </a>

          {/* Mega Menu Dropdown for Categories */}
          <div
            className="relative"
            onMouseEnter={() => setIsMegaMenuOpen(true)}
            onMouseLeave={() => setIsMegaMenuOpen(false)}
          >
            <button className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors py-2">
              <span>Danh Mục Sách</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {isMegaMenuOpen && (
              <div className="absolute top-full left-0 w-80 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xl space-y-2 animate-in fade-in slide-in-from-top-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Chuyên Ngành Đào Tạo
                </p>
                {categories.map((cat) => (
                  <a
                    key={cat.id}
                    href={`/category/${cat.id}`}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-xs font-medium text-slate-800 dark:text-slate-200"
                  >
                    <span>{cat.name}</span>
                    <span className="text-[10px] text-slate-400">{cat.bookCount} cuốn</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <a
            href="#ai-recommend"
            className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:opacity-80 transition-opacity"
          >
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>Gợi Ý AI</span>
          </a>

          <a href="#services" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            Dịch Vụ
          </a>

          <a href="#news" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            Tin Tức
          </a>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Chuyển chế độ sáng tối"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>

          <button
            className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Thông báo"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
          </button>

          {/* Auth Buttons or User Avatar */}
          <div className="hidden sm:flex items-center gap-2">
            {isAuthenticated && user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.fullName} className="w-8 h-8 rounded-full object-cover border-2 border-indigo-500" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                      {getInitials(user.fullName)}
                    </div>
                  )}
                  <div className="text-left hidden md:block">
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{user.fullName}</p>
                    <p className="text-[10px] text-slate-500">{user.role === 'Reader' ? 'Độc giả' : user.role === 'Librarian' ? 'Thủ thư' : 'Admin'}</p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl py-2 animate-in fade-in slide-in-from-top-2 z-50">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{user.fullName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                    </div>
                    <a href="/profile" className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <UserIcon className="w-4 h-4" /> Hồ sơ cá nhân
                    </a>
                    <a href="/settings" className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Settings className="w-4 h-4" /> Cài đặt
                    </a>
                    <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 w-full text-left"
                      >
                        <LogOut className="w-4 h-4" /> Đăng xuất
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 transition-colors"
                >
                  Đăng Nhập
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-indigo-500 shadow-md transition-all"
                >
                  Đăng Ký
                </Link>
              </>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-3 animate-in fade-in">
          <a href="/" className="block py-2 text-sm font-semibold text-slate-900 dark:text-white">
            Trang Chủ
          </a>
          <a href="#categories" className="block py-2 text-sm font-semibold text-slate-900 dark:text-white">
            Danh Mục Sách
          </a>
          <a href="#ai-recommend" className="block py-2 text-sm font-semibold text-indigo-600">
            Gợi Ý AI
          </a>
          <a href="#services" className="block py-2 text-sm font-semibold text-slate-900 dark:text-white">
            Dịch Vụ
          </a>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex gap-2">
            {isAuthenticated && user ? (
              <button onClick={handleLogout} className="w-full py-2 text-center rounded-xl border border-rose-200 text-rose-600 text-xs font-semibold">
                Đăng Xuất
              </button>
            ) : (
              <>
                <Link to="/login" className="w-1/2 py-2 text-center rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                  Đăng Nhập
                </Link>
                <Link to="/register" className="w-1/2 py-2 text-center rounded-xl bg-ai-gradient text-white text-xs font-semibold">
                  Đăng Ký
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
