import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Atom,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  GraduationCap,
  Languages,
  LibraryBig,
  LogOut,
  MapPin,
  Menu,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import smartLibraryLogo from '../../../assets/figma/smartlibrary-logo.png';
import bookCoverOne from '../../../assets/figma/home-book-1.png';
import bookCoverTwo from '../../../assets/figma/home-book-2.png';
import bookCoverThree from '../../../assets/figma/home-book-3.png';
import bookCoverFour from '../../../assets/figma/home-book-4.png';
import libraryPhoto from '../../../assets/figma/home-library.png';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import './HomePage.css';

const categories = [
  {
    name: 'Công nghệ thông tin',
    description: 'Lập trình, hệ thống, phần mềm và bảo mật.',
    count: '3.450',
    Icon: Code2,
  },
  {
    name: 'Kinh tế & Quản trị',
    description: 'Kinh doanh, marketing, tài chính và khởi nghiệp.',
    count: '2.150',
    Icon: TrendingUp,
  },
  {
    name: 'Khoa học dữ liệu & AI',
    description: 'Big Data, Machine Learning và thống kê ứng dụng.',
    count: '1.890',
    Icon: BrainCircuit,
  },
  {
    name: 'Ngoại ngữ & Nhật - Anh',
    description: 'Giáo trình JLPT, IELTS và tiếng Anh chuyên ngành.',
    count: '1.450',
    Icon: Languages,
  },
  {
    name: 'Khoa học & Kỹ thuật',
    description: 'Tài liệu khoa học, kỹ thuật và nghiên cứu chuyên sâu.',
    count: '1.200',
    Icon: Atom,
  },
  {
    name: 'Kỹ năng mềm & Thiết kế',
    description: 'UI/UX, giao tiếp, lãnh đạo và làm việc nhóm.',
    count: '980',
    Icon: Palette,
  },
];

const featuredBooks = [
  {
    title: 'Deep Learning with Python',
    author: 'François Chollet',
    code: 'CS-402',
    category: 'Khoa học dữ liệu & AI',
    location: 'Tầng 2 · Kệ A3',
    availability: 'Còn 5 bản sẵn sàng',
    cover: bookCoverOne,
  },
  {
    title: 'Clean Architecture',
    author: 'Robert C. Martin',
    code: 'SE-301',
    category: 'Công nghệ thông tin',
    location: 'Tầng 2 · Kệ B1',
    availability: 'Còn 3 bản sẵn sàng',
    cover: bookCoverTwo,
  },
  {
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    code: 'CS-315',
    category: 'Công nghệ thông tin',
    location: 'Tầng 3 · Kệ C2',
    availability: 'Còn 2 bản sẵn sàng',
    cover: bookCoverThree,
  },
  {
    title: 'Modern Microeconomics',
    author: 'N. Gregory Mankiw',
    code: 'EC-204',
    category: 'Kinh tế & Quản trị',
    location: 'Tầng 1 · Kệ D4',
    availability: 'Còn 6 bản sẵn sàng',
    cover: bookCoverFour,
  },
];

const popularSearches = [
  'Công nghệ thông tin',
  'Khoa học dữ liệu & AI',
  'Kinh tế & Quản trị',
  'Ngoại ngữ & Nhật - Anh',
];

export const HomePage = () => {
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const { showToast } = useToast();

  const handleLogout = () => {
    logout();
    showToast({ type: 'success', title: 'Đăng xuất thành công', message: 'Bạn đã đăng xuất khỏi SmartLibrary.' });
  };

  const visibleBooks = useMemo(() => {
    const query = appliedSearch.trim().toLocaleLowerCase('vi');
    return featuredBooks.filter((book) => {
      const matchesSearch =
        !query ||
        `${book.title} ${book.author} ${book.code} ${book.category}`
          .toLocaleLowerCase('vi')
          .includes(query);
      const matchesCategory =
        !activeCategory ||
        book.category.toLocaleLowerCase('vi') === activeCategory.toLocaleLowerCase('vi');
      return matchesSearch && matchesCategory;
    });
  }, [activeCategory, appliedSearch]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActiveCategory('');
    setAppliedSearch(searchInput);
    document.getElementById('featured-books')?.scrollIntoView({ behavior: 'smooth' });
  };

  const chooseSearch = (value: string) => {
    setSearchInput(value);
    setActiveCategory('');
    setAppliedSearch(value);
    document.getElementById('featured-books')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="public-home">
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="public-brand" aria-label="SmartLibrary - Trang chủ">
            <img src={smartLibraryLogo} alt="SmartLibrary" />
            <span>FPT UNIVERSITY HCMC</span>
          </Link>

          <button
            type="button"
            className="public-menu-toggle"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={isMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>

          <nav className={`public-nav${isMenuOpen ? ' is-open' : ''}`} aria-label="Điều hướng chính">
            <a href="#top" onClick={() => setIsMenuOpen(false)}>Trang chủ</a>
            <a href="#categories" onClick={() => setIsMenuOpen(false)}>Thể loại</a>
            <a href="#featured-books" onClick={() => setIsMenuOpen(false)}>Sách nổi bật</a>
            <a href="#library" onClick={() => setIsMenuOpen(false)}>Thư viện</a>

            {isAuthenticated && user ? (
              <div className="public-nav-user">
                {user.role === 'Admin' && (
                  <Link to="/admin" className="public-portal-btn admin-portal" onClick={() => setIsMenuOpen(false)}>
                    <ShieldCheck size={14} />
                    <span>Quản trị</span>
                  </Link>
                )}
                {user.role === 'Librarian' && (
                  <Link to="/librarian" className="public-portal-btn librarian-portal" onClick={() => setIsMenuOpen(false)}>
                    <BookOpen size={14} />
                    <span>Thủ thư</span>
                  </Link>
                )}
                <div className="public-user-chip">
                  <div className="public-user-avatar">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.fullName} />
                    ) : (
                      <span>{user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U'}</span>
                    )}
                  </div>
                  <div className="public-user-info">
                    <span className="public-user-name">{user.fullName || user.email}</span>
                    <span className="public-user-role">
                      {user.role === 'Admin' ? 'Admin' : user.role === 'Librarian' ? 'Thủ thư' : 'Độc giả'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="public-logout-btn"
                  onClick={() => {
                    handleLogout();
                    setIsMenuOpen(false);
                  }}
                  title="Đăng xuất"
                >
                  <LogOut size={14} />
                  <span>Đăng xuất</span>
                </button>
              </div>
            ) : (
              <div className="public-nav-auth">
                <Link to="/login" onClick={() => setIsMenuOpen(false)}>Đăng nhập</Link>
                <Link to="/register" className="public-nav-register" onClick={() => setIsMenuOpen(false)}>
                  Đăng ký
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="public-hero" id="top">
          <div className="public-hero-grid" aria-hidden="true" />
          <div className="public-container public-hero-content">
            <div className="public-badge">
              <Sparkles size={14} />
              <span>SMARTLIBRARY · FPT UNIVERSITY HCMC</span>
            </div>
            <h1>Khám phá tri thức, theo cách của bạn.</h1>
            <p className="public-hero-copy">
              Tìm kiếm sách và khám phá những gợi ý phù hợp với hành trình học tập và nghiên cứu
              của bạn tại Đại học FPT TP.HCM.
            </p>
            <form className="public-search" onSubmit={submitSearch} role="search">
              <Search size={19} aria-hidden="true" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Nhập tên sách, tác giả hoặc chủ đề học thuật..."
                aria-label="Tìm sách, tác giả hoặc chủ đề"
              />
              <button type="submit">Tìm kiếm</button>
            </form>
            <div className="public-popular-searches" aria-label="Tìm kiếm phổ biến">
              <span>Tìm kiếm phổ biến:</span>
              {popularSearches.map((term) => (
                <button key={term} type="button" onClick={() => chooseSearch(term)}>
                  {term}
                </button>
              ))}
            </div>
            <div className="public-metrics">
              <div>
                <BookOpen size={18} />
                <strong>13.500+</strong>
                <span>Tài liệu học thuật</span>
              </div>
              <div>
                <Check size={18} />
                <strong>98,6%</strong>
                <span>Tài liệu luôn sẵn sàng</span>
              </div>
              <div>
                <GraduationCap size={20} />
                <strong>100%</strong>
                <span>Chuẩn FPT University</span>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section public-categories" id="categories">
          <div className="public-container">
            <div className="public-section-heading">
              <div>
                <span className="public-eyebrow">PHÂN HỆ HỌC THUẬT</span>
                <h2>Danh mục nổi bật</h2>
                <p>Khám phá tài liệu đa ngành chuẩn quốc tế theo khung chương trình FPT University.</p>
              </div>
              <a href="#featured-books" className="public-text-link">
                Xem tất cả danh mục <ArrowRight size={15} />
              </a>
            </div>
            <div className="public-category-grid">
              {categories.map(({ name, description, count, Icon }) => (
                <button
                  key={name}
                  type="button"
                  className={`public-category-card${activeCategory === name ? ' is-active' : ''}`}
                  onClick={() => {
                    setActiveCategory(activeCategory === name ? '' : name);
                    setAppliedSearch('');
                    setSearchInput('');
                    document.getElementById('featured-books')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <span className="public-icon-box"><Icon size={22} strokeWidth={1.7} /></span>
                  <strong>{name}</strong>
                  <span className="public-category-description">{description}</span>
                  <span className="public-category-meta">
                    <span>{count} cuốn</span>
                    <ChevronRight size={15} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="public-section public-featured" id="featured-books">
          <div className="public-container">
            <div className="public-section-heading public-featured-heading">
              <div>
                <span className="public-eyebrow">TỦ SÁCH ĐƯỢC QUAN TÂM</span>
                <h2>Sách được quan tâm nhiều nhất</h2>
                <p>Tuyển chọn tài liệu nổi bật từ cộng đồng học thuật FPT University.</p>
              </div>
              <div className="public-book-filters" aria-label="Lọc sách">
                <button
                  type="button"
                  className={!activeCategory ? 'is-active' : ''}
                  onClick={() => setActiveCategory('')}
                >
                  Tất cả
                </button>
                <button type="button" onClick={() => chooseSearch('data')}>Data</button>
                <button type="button" onClick={() => chooseSearch('learning')}>AI &amp; Dữ liệu</button>
              </div>
            </div>
            {(appliedSearch || activeCategory) && (
              <div className="public-results-note">
                {visibleBooks.length} kết quả
                {appliedSearch && <> cho “{appliedSearch}”</>}
                {activeCategory && <> trong “{activeCategory}”</>}
                <button
                  type="button"
                  onClick={() => {
                    setAppliedSearch('');
                    setSearchInput('');
                    setActiveCategory('');
                  }}
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}
            {visibleBooks.length > 0 ? (
              <div className="public-book-grid">
                {visibleBooks.map((book, index) => (
                  <article className="public-book-card" key={book.code}>
                    <div className="public-book-cover">
                      <img src={book.cover} alt={`Bìa sách ${book.title}`} />
                      {index === 0 && <span className="public-book-badge">Nổi bật</span>}
                      <span className="public-book-code">{book.code}</span>
                    </div>
                    <div className="public-book-info">
                      <h3>{book.title}</h3>
                      <p>{book.author}</p>
                      <div className="public-book-availability">
                        <span><i />{book.availability}</span>
                        <small>{book.location}</small>
                      </div>
                      <Link to="/login" className="public-book-action">
                        Xem chi tiết <ArrowRight size={15} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="public-empty-results">
                Không tìm thấy sách phù hợp. Hãy thử tên sách, tác giả hoặc chủ đề khác.
              </div>
            )}
          </div>
        </section>

        <section className="public-ai-section">
          <div className="public-container public-ai-layout">
            <div className="public-ai-intro">
              <span className="public-eyebrow">TRỢ LÝ HỌC THUẬT</span>
              <h2>Tìm sách phù hợp với bạn cùng AI.</h2>
              <p>
                Mô tả điều bạn muốn học. SmartLibrary giúp bạn khám phá tài liệu liên quan,
                kể cả khi bạn chưa biết chính xác tên sách.
              </p>
              <Link to="/login" className="public-button public-button-orange">
                Khám phá cùng AI <ArrowRight size={16} />
              </Link>
            </div>
            <div className="public-ai-cards">
              <article>
                <span><Search size={19} /></span>
                <h3>Tìm kiếm theo ý tưởng</h3>
                <p>Diễn đạt nhu cầu bằng ngôn ngữ tự nhiên và nhận gợi ý có liên quan.</p>
              </article>
              <article>
                <span><Sparkles size={19} /></span>
                <h3>Gợi ý cá nhân hóa</h3>
                <p>Khám phá tài liệu phù hợp với chuyên ngành và mục tiêu học tập của bạn.</p>
              </article>
              <article>
                <span><LibraryBig size={19} /></span>
                <h3>Nguồn học thuật tin cậy</h3>
                <p>Tập trung vào giáo trình, sách chuyên ngành và tài nguyên của thư viện.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="public-section public-library" id="library">
          <div className="public-container public-library-layout">
            <div className="public-library-copy">
              <span className="public-eyebrow">KHÔNG GIAN HỌC TẬP &amp; NGHIÊN CỨU HIỆN ĐẠI</span>
              <h2>Tiếp cận tri thức, ở bất kỳ đâu.</h2>
              <p>
                SmartLibrary kết nối nguồn tài liệu số với không gian học tập tại FPT University,
                để việc tìm kiếm, đọc và nghiên cứu luôn liền mạch.
              </p>
              <div className="public-library-stats">
                <div><strong>24/7</strong><span>Truy cập thư viện số</span></div>
                <div><strong>1.200+</strong><span>Chỗ ngồi học tập</span></div>
                <div><strong>100%</strong><span>Kết nối Wi-Fi</span></div>
              </div>
              <div className="public-library-facilities">
                <span><Clock3 size={16} /> Mở cửa mỗi ngày</span>
                <span><MapPin size={16} /> FPT University HCMC</span>
                <span><Wifi size={16} /> Wi-Fi miễn phí</span>
              </div>
            </div>
            <div className="public-library-visual">
              <img src={libraryPhoto} alt="Không gian học tập tại thư viện SmartLibrary" />
              <div className="public-library-caption">
                <Users size={17} />
                <span>Không gian học tập dành cho cộng đồng FPT</span>
              </div>
            </div>
          </div>
        </section>

        <section className="public-cta">
          <div className="public-container public-cta-inner">
            <div>
              <span className="public-eyebrow">
                {isAuthenticated ? 'SMARTLIBRARY · FPT UNIVERSITY' : 'BẮT ĐẦU HÀNH TRÌNH HỌC TẬP'}
              </span>
              <h2>
                {isAuthenticated ? `Chào mừng trở lại, ${user?.fullName || 'Độc giả'}!` : 'Sẵn sàng nâng tầm trải nghiệm học tập?'}
              </h2>
              <p>
                {isAuthenticated
                  ? 'Khám phá hơn 13.500+ đầu sách học thuật, tài liệu chuyên sâu và bắt đầu mượn sách thuận tiện tại thư viện.'
                  : 'Đăng nhập để lưu sách yêu thích và khám phá thêm tài liệu dành riêng cho bạn.'}
              </p>
            </div>
            <div className="public-cta-actions">
              {isAuthenticated ? (
                <>
                  {user?.role === 'Admin' ? (
                    <Link to="/admin" className="public-button public-button-orange">
                      Vào trang Quản trị <ArrowRight size={16} />
                    </Link>
                  ) : user?.role === 'Librarian' ? (
                    <Link to="/librarian" className="public-button public-button-orange">
                      Bàn làm việc Thủ thư <ArrowRight size={16} />
                    </Link>
                  ) : (
                    <a href="#featured-books" className="public-button public-button-orange">
                      Khám phá sách nổi bật <ArrowRight size={16} />
                    </a>
                  )}
                  <button
                    type="button"
                    className="public-button public-button-dark"
                    onClick={handleLogout}
                  >
                    Đăng xuất
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="public-button public-button-dark">Đăng nhập</Link>
                  <Link to="/register" className="public-button public-button-orange">
                    Tạo tài khoản <ArrowRight size={16} />
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-container public-footer-grid">
          <div className="public-footer-brand">
            <Link to="/" className="public-brand">
              <img src={smartLibraryLogo} alt="SmartLibrary" />
              <span>FPT UNIVERSITY HCMC</span>
            </Link>
            <p>Không gian tri thức số kết nối cộng đồng học thuật FPT University.</p>
          </div>
          <div>
            <h3>Khám phá</h3>
            <a href="#categories">Danh mục nổi bật</a>
            <a href="#featured-books">Sách được quan tâm</a>
            <a href="#library">Không gian thư viện</a>
          </div>
          <div>
            <h3>Tài khoản</h3>
            {isAuthenticated ? (
              <>
                {user?.role === 'Admin' && <Link to="/admin">Trang Quản trị</Link>}
                {user?.role === 'Librarian' && <Link to="/librarian">Cổng Thủ thư</Link>}
                <button
                  type="button"
                  className="public-footer-logout-link"
                  onClick={handleLogout}
                >
                  Đăng xuất ({user?.fullName || 'Tài khoản'})
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Đăng nhập</Link>
                <Link to="/register">Đăng ký bạn đọc</Link>
              </>
            )}
            <a href="mailto:library@fpt.edu.vn">Liên hệ hỗ trợ</a>
          </div>
          <div className="public-footer-location">
            <h3>Thư viện FPT</h3>
            <p><MapPin size={15} /> Khu Công nghệ cao, TP. Thủ Đức, TP.HCM</p>
            <p><Clock3 size={15} /> Thứ 2 – Thứ 7 · 07:30 – 21:00</p>
          </div>
        </div>
        <div className="public-container public-footer-bottom">
          <span>© 2026 SmartLibrary · FPT University HCMC</span>
          <span>Tri thức mở ra tương lai.</span>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
