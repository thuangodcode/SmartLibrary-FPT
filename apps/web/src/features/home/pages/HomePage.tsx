import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Clock3, MapPin } from 'lucide-react';
import campusPhoto from '../../../assets/figma/HCM-Campus.jpg';
import libraryPhoto from '../../../assets/figma/home-library.png';
import { BookCard } from '../components/BookCard';
import HomeFooter from '../components/HomeFooter';
import HomeNavbar from '../components/HomeNavbar';
import Marquee from '../components/Marquee';
import { useHomeBooks, useHomeCategories } from '../hooks/useHomeData';
import { toBookCardData } from '../utils/toBookCardData';
import './HomePage.css';

export const HomePage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get('category') ?? '';
  const categoriesQuery = useHomeCategories();
  const booksQuery = useHomeBooks(activeCategory, '', 1);
  const categories = categoriesQuery.data ?? [];
  const books = booksQuery.data?.books ?? [];
  const splitIndex = Math.ceil(books.length / 2);
  const firstRailBooks = books.slice(0, splitIndex);
  const secondRailBooks = books.slice(splitIndex);
  const activeCategoryName = categories.find((category) => category.id === activeCategory)?.name;
  const selectCategory = (categoryId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (categoryId) nextParams.set('category', categoryId);
    else nextParams.delete('category');
    nextParams.delete('page');
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
                <span className="annual-live-eyebrow">Thư viện thông minh</span>
                <h2>{activeCategoryName || 'Bộ sưu tập đang có'}</h2>
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
                <Marquee
                  className="annual-live-book-marquee"
                  aria-label="Hàng sách thứ nhất trong bộ sưu tập"
                  pauseOnHover
                  repeat={3}
                  speed={28}
                >
                  {firstRailBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      book={toBookCardData(book)}
                      onSelect={() => navigate(`/books/${book.id}`)}
                    />
                  ))}
                </Marquee>
                {secondRailBooks.length > 0 && <Marquee
                  className="annual-live-book-marquee annual-live-book-marquee--reverse"
                  aria-label="Hàng sách thứ hai trong bộ sưu tập"
                  pauseOnHover
                  repeat={3}
                  speed={24}
                  reverse
                >
                  {secondRailBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      book={toBookCardData(book)}
                      onSelect={() => navigate(`/books/${book.id}`)}
                    />
                  ))}
                </Marquee>}

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

      <HomeFooter />
    </div>
  );
};

export default HomePage;
