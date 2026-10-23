import { useState } from 'react';
import { BookOpen, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import smartLibraryLogo from '../../../assets/figma/smartlibrary-logo.png';
import { useToast } from '../../../components/ui/useToast';
import { useAuthStore } from '../../auth/store/useAuthStore';

type HomeNavSection = 'services' | 'news' | 'policies';

const HomeNavbar: React.FC<{ activeSection?: HomeNavSection }> = ({ activeSection }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const { showToast } = useToast();
  const closeMenu = () => setIsMenuOpen(false);
  const sectionHref = (anchor: string) => activeSection ? `/#${anchor}` : `#${anchor}`;

  const handleLogout = () => {
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
        <button
          type="button"
          className="annual-menu-toggle"
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? 'Đóng menu' : 'Mở menu'}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X /> : <Menu />}
        </button>
        <nav className={`annual-nav${isMenuOpen ? ' is-open' : ''}`} aria-label="Điều hướng chính">
          <a href={sectionHref('categories')} onClick={closeMenu}>Danh mục</a>
          <a href={sectionHref('books')} onClick={closeMenu}>Tủ sách</a>
          <Link to="/services" aria-current={activeSection === 'services' ? 'page' : undefined} onClick={closeMenu}>Dịch vụ</Link>
          <Link to="/news" aria-current={activeSection === 'news' ? 'page' : undefined} onClick={closeMenu}>Tin tức</Link>
          <a href={sectionHref('library')} onClick={closeMenu}>Thư viện</a>
          {isAuthenticated && user ? (
            <div className="annual-account">
              {user.role === 'Admin' && <Link to="/admin" onClick={closeMenu}><ShieldCheck size={16} /> Quản trị</Link>}
              {user.role === 'Librarian' && <Link to="/librarian" onClick={closeMenu}><BookOpen size={16} /> Thủ thư</Link>}
              <span className="annual-user-name">{user.fullName || user.email}</span>
              <button type="button" onClick={handleLogout}><LogOut size={16} /> Đăng xuất</button>
            </div>
          ) : (
            <div className="annual-auth">
              <Link to="/login" onClick={closeMenu}>Đăng nhập</Link>
              <Link to="/register" className="annual-action" onClick={closeMenu}>Đăng ký</Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};

export default HomeNavbar;
