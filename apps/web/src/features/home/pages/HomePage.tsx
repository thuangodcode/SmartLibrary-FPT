import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock3, MapPin } from 'lucide-react';
import campusPhoto from '../../../assets/figma/HCM-Campus.jpg';
import libraryPhoto from '../../../assets/figma/home-library.png';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { BookCard } from '../components/BookCard';
import HomeNavbar from '../components/HomeNavbar';
import { useHomeBooks, useHomeCategories } from '../hooks/useHomeData';
import { toBookCardData } from '../utils/toBookCardData';
import './HomePage.css';

export const HomePage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get('category') ?? '';
  const requestedPage = Number(searchParams.get('page') ?? 1);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const categoriesQuery = useHomeCategories();
  const booksQuery = useHomeBooks(activeCategory, '', page);
  const categories = categoriesQuery.data ?? [];
  const books = booksQuery.data?.books ?? [];
  const activeCategoryName = categories.find((category) => category.id === activeCategory)?.name;
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userRole = useAuthStore((state) => state.user?.role);
  const selectCategory = (categoryId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (categoryId) nextParams.set('category', categoryId);
    else nextParams.delete('category');
    nextParams.delete('page');
    setSearchParams(nextParams);
  };

  const setPage = (nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage > 1) nextParams.set('page', String(nextPage));
    else nextParams.delete('page');
    setSearchParams(nextParams);
  };

  return (
    <div className="annual-home">
      <HomeNavbar />

      <main>
        <section className="annual-hero" id="top" aria-label="Khuôn viên FPT University">
          <div className="annual-hero-media">
            <img src={campusPhoto} alt="Khuôn viên xanh của FPT University TP. Hồ Chí Minh" />
          </div>
        </section>

        <section className="annual-section annual-categories" id="categories">
          <div className="annual-frame">
            <div className="annual-live-section-heading">
              <div>
                <span className="annual-live-eyebrow">Khám phá theo chủ đề</span>
                <h2>Lĩnh vực tri thức</h2>
              </div>
              <p>Chọn lĩnh vực bạn quan tâm để tìm nhanh tài liệu phù hợp.</p>
            </div>
            {categoriesQuery.isPending ? (
              <div className="annual-live-category-list" aria-label="Đang tải danh mục">
                {Array.from({ length: 5 }, (_, index) => <div className="annual-live-category-skeleton" key={index} />)}
              </div>
            ) : categoriesQuery.isError ? (
              <div className="annual-live-error" role="alert">Không thể tải danh mục. {categoriesQuery.error.message}</div>
            ) : categories.length ? (
              <div className="annual-live-category-list">
                <button
                  type="button"
                  className={!activeCategory ? 'is-active' : ''}
                  onClick={() => selectCategory('')}
                  aria-pressed={!activeCategory}
                >
                  <span className="annual-live-category-name">Tất cả lĩnh vực</span>
                  <span className="annual-live-category-count">
                    {categories.reduce((count, category) => count + category.bookCount, 0)}
                  </span>
                </button>
                {categories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    className={activeCategory === category.id ? 'is-active' : ''}
                    onClick={() => selectCategory(category.id)}
                    aria-pressed={activeCategory === category.id}
                  >
                    <span className="annual-live-category-name">{category.name}</span>
                    <span className="annual-live-category-count">{category.bookCount}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="annual-live-empty">Thư viện hiện chưa có danh mục sách nào.</div>
            )}
          </div>
        </section>

        <section className="annual-section annual-books" id="books">
          <div className="annual-frame">
            <div className="annual-live-section-heading annual-live-books-heading">
              <div>
                <h2>{activeCategoryName || 'Gợi ý dành cho bạn'}</h2>
                <p className="annual-live-books-subtitle">
                  {activeCategoryName
                    ? `Tuyển chọn đầu sách thuộc lĩnh vực ${activeCategoryName}.`
                    : 'Khám phá nguồn tri thức được tuyển chọn từ bộ sưu tập của thư viện.'}
                </p>
              </div>
              <Link to="/books" className="annual-live-discover-link">Khám phá toàn bộ sách <span aria-hidden="true">→</span></Link>
            </div>
            {booksQuery.isPending ? (
              <div className="annual-live-book-grid" aria-label="Đang tải đầu sách">
                {Array.from({ length: 5 }, (_, index) => <div className="annual-live-book-skeleton" key={index} />)}
              </div>
            ) : booksQuery.isError ? (
              <div className="annual-live-error" role="alert">Không thể tải đầu sách. {booksQuery.error.message}</div>
            ) : books.length ? (
              <>
                <div className="annual-live-book-grid" aria-label="Danh sách đầu sách" tabIndex={0}>
                  {books.map((book) => <BookCard key={book.id} book={toBookCardData(book)} onSelect={() => navigate(`/books/${book.id}`)} />)}
                </div>
                {booksQuery.data && booksQuery.data.totalPages > 1 && (
                  <div className="annual-live-pagination" aria-label="Phân trang đầu sách">
                    <button type="button" disabled={page <= 1 || booksQuery.isFetching} onClick={() => setPage(page - 1)}>Trang trước</button>
                    <span>Trang {page} / {booksQuery.data.totalPages}</span>
                    <button
                      type="button"
                      disabled={page >= booksQuery.data.totalPages || booksQuery.isFetching}
                      onClick={() => setPage(page + 1)}
                    >
                      Trang sau
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="annual-live-empty">
                <h3>Chưa có đầu sách trong danh mục này.</h3>
                <p>Hãy chọn lĩnh vực khác hoặc khám phá toàn bộ bộ sưu tập.</p>
                <button type="button" onClick={() => selectCategory('')}>Xem tất cả đầu sách</button>
              </div>
            )}
          </div>
        </section>

        <section className="annual-section annual-library" id="library">
          <div className="annual-library-image">
            <img src={libraryPhoto} alt="Không gian học tập trong thư viện FPT University" />
            <span></span>
          </div>
          <div className="annual-library-field">
            <div>
              <h2>Nơi tri thức hội tụ, tư duy khai mở và tương lai bắt đầu.</h2>
              <p>Nhiều khu đọc sách yên tĩnh, góc học tập hiện đại, làm việc nhóm, nghiên cứu và khám phá những ý tưởng mới.</p>
            </div>
            <dl>
              <div><dt><Clock3 size={20} /> Thứ Hai – Thứ Sáu</dt><dd>07:00 – 19:00</dd></div>
              <div><dt><Clock3 size={20} /> Thứ Bảy</dt><dd>07:00 – 17:00</dd></div>
              <div><dt><Clock3 size={20} /> Chủ Nhật</dt><dd>Không phục vụ</dd></div>
              <div><dt><MapPin size={20} /> Địa điểm</dt><dd>Tòa Alpha, Khu Công nghệ cao, TP. Thủ Đức</dd></div>
            </dl>
          </div>
        </section>
      </main>

      <footer className="annual-footer">
        <div className="annual-frame annual-footer-grid">
          <div><strong>Ghé thư viện</strong><p>Tòa Alpha, Khu Công nghệ cao, TP. Thủ Đức, TP. Hồ Chí Minh</p></div>
          <div><strong>Khám phá</strong><Link to="/books">Danh mục & đầu sách</Link><Link to="/services">Dịch vụ</Link><Link to="/news">Tin tức</Link><Link to="/policies">Chính sách</Link></div>
          <div className="annual-footer-hours"><strong>Thời gian</strong><p><span>Thứ Hai – Thứ Sáu</span><span>07:00 – 19:00</span></p><p><span>Thứ Bảy</span><span>07:00 – 17:00</span></p><p><span>Chủ Nhật</span><span>Không phục vụ</span></p></div>
          <div>
            <strong>Tài khoản</strong>
            {isAuthenticated
              ? <><Link to="/profile">Hồ sơ cá nhân</Link>{userRole === 'Reader' && <><Link to="/support">Hỗ trợ</Link><Link to="/history">Lịch sử</Link></>}</>
              : <><Link to="/login">Đăng nhập</Link><Link to="/register">Đăng ký</Link></>}
          </div>
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
