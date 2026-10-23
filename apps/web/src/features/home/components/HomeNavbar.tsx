import { useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown, LogOut, Menu, Search, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import smartLibraryLogo from '../../../assets/figma/smartlibrary-logo.png';
import { useToast } from '../../../components/ui/useToast';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { MOCK_CATEGORIES } from '../mock';

type HomeNavSection = 'services' | 'news' | 'policies';

const HomeNavbar: React.FC<{ activeSection?: HomeNavSection; searchSlot?: ReactNode }> = ({ activeSection, searchSlot }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const { showToast } = useToast();
  const closeMenu = () => {
    setIsMenuOpen(false);
    setIsCategoriesOpen(false);
  };
  const sectionHref = (anchor: string) => activeSection ? `/#${anchor}` : `#${anchor}`;
  const defaultSearch = (
    <form className="annual-search" action="/" method="get" role="search" aria-label="Tìm sách trong thư viện">
      <Search size={22} aria-hidden="true" />
      <label className="sr-only" htmlFor="annual-navbar-book-search">Tìm sách</label>
      <input id="annual-navbar-book-search" name="q" placeholder="Tên sách, tác giả, ISBN hoặc điều bạn muốn học" />
      <button type="submit">Tìm trong thư viện</button>
    </form>
  );

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
        <div className="annual-header-search">{searchSlot ?? defaultSearch}</div>
        {isAuthenticated && user ? (
          <div className="annual-account annual-header-actions">
            {user.role === 'Admin' && <Link to="/admin" onClick={closeMenu}><ShieldCheck size={16} /> Quản trị</Link>}
            {user.role === 'Librarian' && <Link to="/librarian" onClick={closeMenu}><BookOpen size={16} /> Thủ thư</Link>}
            <span className="annual-user-name">{user.fullName || user.email}</span>
            <button type="button" onClick={handleLogout}><LogOut size={16} /> Đăng xuất</button>
          </div>
        ) : (
          <div className="annual-auth annual-header-actions">
            <Link to="/login" onClick={closeMenu}>Đăng nhập</Link>
            <Link to="/register" className="annual-action" onClick={closeMenu}>Đăng ký</Link>
          </div>
        )}
        <button
          type="button"
          className="annual-menu-toggle"
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? 'Đóng menu' : 'Mở menu'}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X /> : <Menu />}
        </button>
      </div>
      <div className="annual-frame annual-nav-row">
        <nav className={`annual-nav${isMenuOpen ? ' is-open' : ''}`} aria-label="Điều hướng chính">
          <div className={`annual-nav-dropdown${isCategoriesOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              aria-expanded={isCategoriesOpen}
              onClick={() => setIsCategoriesOpen((open) => !open)}
            >
              Danh mục <ChevronDown size={15} aria-hidden="true" />
            </button>
            <div className="annual-nav-submenu">
              {MOCK_CATEGORIES.map((category) => (
                <a key={category.id} href={sectionHref('categories')} onClick={closeMenu}>{category.name}</a>
              ))}
            </div>
          </div>
          <a href={sectionHref('books')} onClick={closeMenu}>Tủ sách</a>
          <Link to="/services" aria-current={activeSection === 'services' ? 'page' : undefined} onClick={closeMenu}>Dịch vụ</Link>
          <Link to="/news" aria-current={activeSection === 'news' ? 'page' : undefined} onClick={closeMenu}>Tin tức</Link>
          <a href={sectionHref('library')} onClick={closeMenu}>Thư viện</a>
        </nav>
      </div>
    </header>
  );
};

export default HomeNavbar;
