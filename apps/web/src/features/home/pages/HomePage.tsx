import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Clock3, LogOut, MapPin, Menu, Search, ShieldCheck, X } from 'lucide-react';
import smartLibraryLogo from '../../../assets/figma/smartlibrary-logo.png';
import campusPhoto from '../../../assets/figma/HCM-Campus.jpg';
import libraryPhoto from '../../../assets/figma/home-library.png';
import bookCoverOne from '../../../assets/figma/home-book-1.png';
import bookCoverTwo from '../../../assets/figma/home-book-2.png';
import bookCoverThree from '../../../assets/figma/home-book-3.png';
import bookCoverFour from '../../../assets/figma/home-book-4.png';
import cantHurtMeCover from "../../../assets/figma/Can'tHurtMe.jpg";
import powerLawsCover from '../../../assets/figma/48PowerOfLaws.webp';
import meditationsCover from '../../../assets/figma/MeditationMarcusAurelius.webp';
import pragmaticProgrammerCover from '../../../assets/figma/ThePragmaticProgrammer.jpg';
import republicCover from '../../../assets/figma/TheRepublicPlato.webp';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { MOCK_BOOKS, MOCK_CATEGORIES, MOCK_FAQS, MOCK_NEWS, MOCK_SERVICES } from '../mock';
import './HomePage.css';

const bookCovers = [bookCoverOne, bookCoverTwo, bookCoverThree, bookCoverFour];
const specialBookCovers: Record<string, string> = {
  b11: cantHurtMeCover,
  b12: powerLawsCover,
  b13: meditationsCover,
  b14: pragmaticProgrammerCover,
  b15: republicCover,
};
const quickSearches = ['React', 'Trí tuệ nhân tạo', 'Kỹ năng mềm'];

export const HomePage = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const categoryRailRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const { showToast } = useToast();

  const handleLogout = () => {
    logout();
    showToast({ type: 'success', title: 'Đăng xuất thành công', message: 'Bạn đã đăng xuất khỏi SmartLibrary.' });
  };

  const totalBooks = useMemo(() => MOCK_CATEGORIES.reduce((total, category) => total + category.bookCount, 0), []);
  const visibleBooks = useMemo(() => {
    const query = appliedSearch.trim().toLocaleLowerCase('vi');
    return MOCK_BOOKS.filter((book) => {
      const searchable = [book.title, book.author, book.category, book.isbn, book.description, book.publisher].join(' ').toLocaleLowerCase('vi');
      return (!query || searchable.includes(query)) && (!activeCategory || book.categoryId === activeCategory);
    });
  }, [activeCategory, appliedSearch]);

  const scrollToBooks = () => window.setTimeout(() => document.getElementById('books')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setActiveCategory(''); setAppliedSearch(searchInput); scrollToBooks(); };
  const applyQuickSearch = (value: string) => { setSearchInput(value); setAppliedSearch(value); setActiveCategory(''); scrollToBooks(); };
  const selectCategory = (categoryId: string) => { setActiveCategory((current) => current === categoryId ? '' : categoryId); setAppliedSearch(''); setSearchInput(''); scrollToBooks(); };
  const scrollCategoryRail = (direction: -1 | 1) => categoryRailRef.current?.scrollBy({ left: direction * 340, behavior: 'smooth' });
  const clearFilters = () => { setSearchInput(''); setAppliedSearch(''); setActiveCategory(''); };
  const closeMenu = () => setIsMenuOpen(false);
  const cta = isAuthenticated && user
    ? user.role === 'Admin' ? { label: 'Mở trang quản trị', to: '/admin' }
      : user.role === 'Librarian' ? { label: 'Mở bàn thủ thư', to: '/librarian' }
        : { label: 'Khám phá tủ sách', to: '#books' }
    : { label: 'Bắt đầu với SmartLibrary', to: '/register' };

  return (
    <div className="annual-home">
      <header className="annual-header">
        <div className="annual-frame annual-header-inner">
          <Link to="/" className="annual-brand" aria-label="SmartLibrary - Trang chủ"><img src={smartLibraryLogo} alt="SmartLibrary" /></Link>
          <button type="button" className="annual-menu-toggle" aria-expanded={isMenuOpen} aria-label={isMenuOpen ? 'Đóng menu' : 'Mở menu'} onClick={() => setIsMenuOpen((open) => !open)}>{isMenuOpen ? <X /> : <Menu />}</button>
          <nav className={`annual-nav${isMenuOpen ? ' is-open' : ''}`} aria-label="Điều hướng chính">
            <a href="#categories" onClick={closeMenu}>Danh mục</a><a href="#books" onClick={closeMenu}>Tủ sách</a><a href="#services" onClick={closeMenu}>Dịch vụ</a><a href="#library" onClick={closeMenu}>Thư viện</a>
            {isAuthenticated && user ? <div className="annual-account">
              {user.role === 'Admin' && <Link to="/admin" onClick={closeMenu}><ShieldCheck size={16} /> Quản trị</Link>}
              {user.role === 'Librarian' && <Link to="/librarian" onClick={closeMenu}><BookOpen size={16} /> Thủ thư</Link>}
              <span className="annual-user-name">{user.fullName || user.email}</span>
              <button type="button" onClick={() => { handleLogout(); closeMenu(); }}><LogOut size={16} /> Đăng xuất</button>
            </div> : <div className="annual-auth"><Link to="/login" onClick={closeMenu}>Đăng nhập</Link><Link to="/register" className="annual-action" onClick={closeMenu}>Đăng ký</Link></div>}
          </nav>
        </div>
      </header>

      <main>
        <section className="annual-hero" id="top">
          <div className="annual-frame annual-hero-copy">
            <div className="annual-hero-side"><p>Thư viện học thuật dành cho cộng đồng FPT University tại TP. Hồ Chí Minh.</p><a href="#categories" className="annual-inline-link">Bắt đầu khám phá <ArrowDown size={18} /></a></div>
            <h1 aria-label="Tri thức, theo cách của bạn"><span>Tri thức,</span><span>theo cách của bạn.</span></h1>
          </div>
          <div className="annual-hero-media">
            <img src={campusPhoto} alt="Khuôn viên xanh của FPT University TP. Hồ Chí Minh" />
            <div className="annual-frame annual-search-dock">
              <form className="annual-search" onSubmit={submitSearch} role="search"><Search size={22} aria-hidden="true" /><label className="sr-only" htmlFor="annual-book-search">Tìm sách</label><input id="annual-book-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tên sách, tác giả, ISBN hoặc điều bạn muốn học" /><button type="submit">Tìm trong thư viện</button></form>
              <div className="annual-search-suggestions" aria-label="Gợi ý tìm kiếm"><span>Thử tìm:</span>{quickSearches.map((term) => <button type="button" key={term} onClick={() => applyQuickSearch(term)}>{term}</button>)}</div>
            </div>
            <div className="annual-hero-stat"><strong>{totalBooks.toLocaleString('vi-VN')}+</strong><span>đầu sách đang chờ được mở</span></div>
          </div>
        </section>

        <section className="annual-section annual-categories" id="categories">
          <div className="annual-frame annual-directory-layout">
            <div className="annual-directory-intro"><h2>Bạn muốn bắt đầu từ đâu?</h2><p>Tám lối vào cho tám kiểu tò mò. Chọn một lĩnh vực để mở đúng ngăn sách bạn cần.</p><div className="annual-directory-art" aria-label="Tuyển tập sách từ nhiều lĩnh vực"><div className="annual-art-field"><span>Đọc rộng hơn ngành học của bạn.</span></div><img className="annual-art-book art-book-one" src={meditationsCover} alt="Bìa sách Meditations" /><img className="annual-art-book art-book-two" src={pragmaticProgrammerCover} alt="Bìa sách The Pragmatic Programmer" /><img className="annual-art-book art-book-three" src={republicCover} alt="Bìa sách The Republic" /></div></div>
            <div className="annual-directory">{MOCK_CATEGORIES.map((category) => <button type="button" key={category.id} className={activeCategory === category.id ? 'is-active' : ''} onClick={() => selectCategory(category.id)}><span className="annual-directory-name">{category.name}</span><span className="annual-directory-description">{category.description}</span><span className="annual-directory-count">{category.bookCount.toLocaleString('vi-VN')} cuốn</span><ArrowRight aria-hidden="true" /></button>)}</div>
          </div>
        </section>

        <section className="annual-section annual-books" id="books">
          <div className="annual-frame">
            <div className="annual-section-head annual-books-head"><h2>Đang được đọc tại FPT.</h2><div className="annual-book-filter-shell"><button type="button" className="annual-rail-arrow" onClick={() => scrollCategoryRail(-1)} aria-label="Xem danh mục phía trước"><ChevronLeft /></button><div className="annual-book-controls" ref={categoryRailRef}><button type="button" className={!activeCategory ? 'is-active' : ''} onClick={clearFilters}>Tất cả</button>{MOCK_CATEGORIES.map((category) => <button type="button" key={category.id} className={activeCategory === category.id ? 'is-active' : ''} onClick={(event) => { selectCategory(category.id); event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }}>{category.name}</button>)}</div><button type="button" className="annual-rail-arrow" onClick={() => scrollCategoryRail(1)} aria-label="Xem thêm danh mục"><ChevronRight /></button></div></div>
            {(appliedSearch || activeCategory) && <div className="annual-result-note"><span>{visibleBooks.length} kết quả {appliedSearch ? `cho “${appliedSearch}”` : `trong “${MOCK_CATEGORIES.find((category) => category.id === activeCategory)?.name || activeCategory}”`}</span><button type="button" onClick={clearFilters}>Xóa bộ lọc</button></div>}
            {visibleBooks.length ? <div className="annual-book-stage">{visibleBooks.map((book, index) => <article className="annual-book" key={book.id}><div className="annual-book-image"><img src={specialBookCovers[book.id] || bookCovers[index % bookCovers.length]} alt={`Bìa sách ${book.title}`} /></div><div className="annual-book-copy"><span>{book.category}</span><h3>{book.title}</h3><p>{book.author}</p><div className="annual-book-meta"><span>{book.availableCopies > 0 ? `${book.availableCopies} bản có sẵn` : 'Đang chờ trả'}</span><span>{book.publishYear}</span></div></div></article>)}</div> : <div className="annual-empty"><h3>Danh mục này chưa có sách.</h3><p>Kho mock hiện chưa có tài liệu phù hợp. Bạn có thể chọn một danh mục khác hoặc xem toàn bộ tủ sách.</p><button type="button" onClick={clearFilters}>Xem toàn bộ sách</button></div>}
          </div>
        </section>

        <section className="annual-section annual-services" id="services"><div className="annual-frame"><div className="annual-services-head"><h2>Các dịch vụ dành cho bạn.</h2><p></p></div><div className="annual-service-mosaic"><div className="annual-service-note"><strong>Mượn. Gia hạn. Theo dõi.</strong><span>Ba việc cần thiết, ngay tại một nơi.</span></div>{MOCK_SERVICES.map((service, index) => <button type="button" key={service.id} className={`annual-service service-${index + 1}`} onClick={() => navigate(service.route)}><span>{service.badge || 'Dành cho bạn'}</span><strong>{service.title}</strong><p>{service.description}</p><ArrowRight aria-hidden="true" /></button>)}</div></div></section>

        <section className="annual-section annual-library" id="library">
          <div className="annual-library-image"><img src={libraryPhoto} alt="Không gian học tập trong thư viện FPT University" /><span>SmartLibrary · FPT University HCMC</span></div>
          <div className="annual-library-field"><div><h2>Nơi tri thức hội tụ, tư duy khai mở và tương lai bắt đầu.</h2><p>Nhiều khu đọc sách yên tĩnh, góc học tập hiện đại, làm việc nhóm , nghiên cứu và khám phá những ý tưởng mới</p></div><dl><div><dt><Clock3 size={20} /> Thứ Hai – Thứ Sáu</dt><dd>07:00 – 19:00</dd></div><div><dt><Clock3 size={20} /> Thứ Bảy</dt><dd>07:00 – 17:00</dd></div><div><dt><Clock3 size={20} /> Chủ Nhật</dt><dd>Không phục vụ</dd></div><div><dt><MapPin size={20} /> Địa điểm</dt><dd>Tòa Alpha, Khu Công nghệ cao, TP. Thủ Đức</dd></div></dl><p className="annual-facilities"></p></div>
        </section>

        <section className="annual-section annual-news"><div className="annual-frame"><div className="annual-section-head annual-news-head"><div><h2>Tin tức & Thông báo</h2></div><p></p></div><div className="annual-news-layout"><article className="annual-news-lead"><div className="annual-news-meta"><span>{MOCK_NEWS[0].category}</span><time>{MOCK_NEWS[0].date}</time></div><h3>{MOCK_NEWS[0].title}</h3><p>{MOCK_NEWS[0].summary}</p><button type="button">Đọc trong {MOCK_NEWS[0].readTime} <ArrowRight size={18} /></button></article><div className="annual-news-list">{MOCK_NEWS.slice(1).map((item) => <article key={item.id}><div className="annual-news-meta"><span>{item.category}</span><time>{item.date}</time></div><h3>{item.title}</h3><p>{item.summary}</p><span>{item.readTime}</span></article>)}</div></div></div></section>

        <section className="annual-section annual-faq"><div className="annual-frame annual-faq-layout"><div className="annual-faq-intro"><h2>Những điều cần biết.</h2><p>Câu trả lời ngắn cho những việc sinh viên thường hỏi nhất tại quầy.</p><div className="annual-faq-stamp"><strong>14 ngày</strong><span>thời hạn mượn tiêu chuẩn</span></div></div><div className="annual-faq-copy">{MOCK_FAQS.map((item) => <p key={item.id}><strong>{item.question}</strong> {item.answer}</p>)}</div></div></section>

        <section className="annual-cta"><div className="annual-cta-photo"><img src={campusPhoto} alt="Khoảng xanh tại FPT University TP. Hồ Chí Minh" /></div><div className="annual-frame annual-cta-inner"><h2>Mở sách.<br />Mở một lối đi.</h2><div><p>{isAuthenticated ? `Chào ${user?.fullName || 'bạn'}, tủ sách vẫn đang mở.` : 'Tạo tài khoản để giữ sách, gia hạn và nhận gợi ý phù hợp với ngành học.'}</p>{cta.to.startsWith('#') ? <a href={cta.to} className="annual-cta-button">{cta.label} <ArrowRight /></a> : <Link to={cta.to} className="annual-cta-button">{cta.label} <ArrowRight /></Link>}</div></div></section>
      </main>

      <footer className="annual-footer">
        <div className="annual-frame annual-footer-top">
          <Link to="/" className="annual-footer-logo" aria-label="SmartLibrary - Trang chủ">
            <img src={smartLibraryLogo} alt="SmartLibrary" />
          </Link>
          <p>Một thư viện sống cùng nhịp học tập của sinh viên FPT.</p>
        </div>
        <div className="annual-frame annual-footer-grid">
          <div><strong>Ghé thư viện</strong><p>Tòa Alpha, Khu Công nghệ cao<br />TP. Thủ Đức, TP. Hồ Chí Minh</p></div>
          <div><strong>Khám phá</strong><a href="#categories">Danh mục</a><a href="#books">Tủ sách</a><a href="#services">Dịch vụ</a></div>
          <div><strong>Thời gian</strong><p>Thứ Hai – Thứ Sáu<br />07:00 – 19:00</p><p>Thứ Bảy<br />07:00 – 17:00</p><p>Chủ Nhật · Không phục vụ</p></div>
          <div><strong>Tài khoản</strong>{isAuthenticated ? <button type="button" onClick={handleLogout}>Đăng xuất</button> : <><Link to="/login">Đăng nhập</Link><Link to="/register">Đăng ký</Link></>}</div>
        </div>
        <div className="annual-frame annual-footer-legal">
          <span>© 2026 FPT University HCMC</span>
          <span>Tri thức dành cho cộng đồng.</span>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
