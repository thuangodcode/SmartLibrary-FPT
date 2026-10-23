import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, Clock3, MapPin, Search } from 'lucide-react';
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
import { MOCK_BOOKS, MOCK_CATEGORIES } from '../mock';
import HomeNavbar from '../components/HomeNavbar';
import './HomePage.css';

const bookCovers = [bookCoverOne, bookCoverTwo, bookCoverThree, bookCoverFour];
const specialBookCovers: Record<string, string> = {
  b11: cantHurtMeCover,
  b12: powerLawsCover,
  b13: meditationsCover,
  b14: pragmaticProgrammerCover,
  b15: republicCover,
};
export const HomePage = () => {
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const categoryRailRef = useRef<HTMLDivElement>(null);
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
  const selectCategory = (categoryId: string) => { setActiveCategory((current) => current === categoryId ? '' : categoryId); setAppliedSearch(''); setSearchInput(''); scrollToBooks(); };
  const scrollCategoryRail = (direction: -1 | 1) => categoryRailRef.current?.scrollBy({ left: direction * 340, behavior: 'smooth' });
  const clearFilters = () => { setSearchInput(''); setAppliedSearch(''); setActiveCategory(''); };
  return (
    <div className="annual-home">
      <HomeNavbar />

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

        <section className="annual-section annual-library" id="library">
          <div className="annual-library-image"><img src={libraryPhoto} alt="Không gian học tập trong thư viện FPT University" /><span></span></div>
          <div className="annual-library-field"><div><h2>Nơi tri thức hội tụ, tư duy khai mở và tương lai bắt đầu.</h2><p>Nhiều khu đọc sách yên tĩnh, góc học tập hiện đại, làm việc nhóm , nghiên cứu và khám phá những ý tưởng mới</p></div><dl><div><dt><Clock3 size={20} /> Thứ Hai – Thứ Sáu</dt><dd>07:00 – 19:00</dd></div><div><dt><Clock3 size={20} /> Thứ Bảy</dt><dd>07:00 – 17:00</dd></div><div><dt><Clock3 size={20} /> Chủ Nhật</dt><dd>Không phục vụ</dd></div><div><dt><MapPin size={20} /> Địa điểm</dt><dd>Tòa Alpha, Khu Công nghệ cao, TP. Thủ Đức</dd></div></dl><p className="annual-facilities"></p></div>
        </section>

      </main>

      <footer className="annual-footer">
        <div className="annual-frame annual-footer-top">

          <p></p>
        </div>
        <div className="annual-frame annual-footer-grid">
          <div><strong>Ghé thư viện</strong><p>Tòa Alpha, Khu Công nghệ cao, TP. Thủ Đức, TP. Hồ Chí Minh</p></div>
          <div><strong>Khám phá</strong><a href="#categories">Danh mục</a><a href="#books">Tủ sách</a><Link to="/services">Dịch vụ</Link><Link to="/news">Tin tức</Link><Link to="/policies">Chính sách</Link></div>
          <div className="annual-footer-hours"><strong>Thời gian</strong><p><span>Thứ Hai – Thứ Sáu</span><span>07:00 – 19:00</span></p><p><span>Thứ Bảy</span><span>07:00 – 17:00</span></p><p><span>Chủ Nhật</span><span>Không phục vụ</span></p></div>
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
