import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LibraryBig, Search, X } from 'lucide-react';
import { BookCard } from '../components/BookCard';
import HomeNavbar from '../components/HomeNavbar';
import { useHomeBooks, useHomeCategories } from '../hooks/useHomeData';
import { toBookCardData } from '../utils/toBookCardData';
import './HomePage.css';
import './HomeCatalogPage.css';

const HomeCatalogPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeCategory = searchParams.get('category') ?? '';
  const search = searchParams.get('q') ?? '';
  const requestedPage = Number(searchParams.get('page') ?? 1);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const categoriesQuery = useHomeCategories();
  const booksQuery = useHomeBooks(activeCategory, search, page);
  const categories = categoriesQuery.data ?? [];
  const categoryName = categories.find((category) => category.id === activeCategory)?.name;
  const books = booksQuery.data?.books ?? [];
  const totalBooks = booksQuery.data?.totalCount ?? categories.reduce((count, category) => count + category.bookCount, 0);
  const availableBooks = books.reduce((count, book) => count + (book.availableCopies > 0 ? 1 : 0), 0);

  const selectCategory = (categoryId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (categoryId) nextParams.set('category', categoryId);
    else nextParams.delete('category');
    nextParams.delete('page');
    setSearchParams(nextParams);
  };

  const clearFilters = () => setSearchParams({});

  const setPage = (nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage > 1) nextParams.set('page', String(nextPage));
    else nextParams.delete('page');
    setSearchParams(nextParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="annual-home annual-catalog-page">
      <HomeNavbar activeSection="catalog" />
      <main className="catalog-main">
        <header className="catalog-hero">
          <div className="catalog-hero__copy">
            <h1>Khám phá sách</h1>
            <p>Tìm cuốn sách tiếp theo cho môn học, dự án hoặc một ý tưởng bạn đang theo đuổi.</p>
          </div>
          <dl className="catalog-hero__facts" aria-label="Tổng quan bộ sưu tập">
            <div>
              <dt>Đầu sách</dt>
              <dd>{totalBooks.toLocaleString('vi-VN')}</dd>
            </div>
            <div>
              <dt>Danh mục</dt>
              <dd>{categories.length}</dd>
            </div>
            <div>
              <dt>Có thể mượn</dt>
              <dd>{booksQuery.data ? `${availableBooks}/${books.length}` : '—'}</dd>
            </div>
          </dl>
          <a className="catalog-hero__search" href="#catalog-collection">
            <Search aria-hidden="true" />
            <span>Tìm trong bộ sưu tập</span>
          </a>
        </header>

        <section className="catalog-mobile-categories" aria-label="Danh mục sách nổi bật">
          <div className="catalog-mobile-categories__heading">
            <h2>Duyệt theo danh mục</h2>
            <span>Vuốt để xem thêm</span>
          </div>
          <div className="catalog-mobile-categories__rail">
            <button type="button" className={!activeCategory ? 'is-active' : ''} onClick={() => selectCategory('')}>Tất cả</button>
            {categories.map((category) => (
              <button type="button" key={category.id} className={activeCategory === category.id ? 'is-active' : ''} onClick={() => selectCategory(category.id)}>
                {category.name}<small>{category.bookCount}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="catalog-layout" id="catalog-collection">
          <aside className="catalog-sidebar" aria-label="Lọc theo danh mục">
            <div className="catalog-sidebar-heading">
              <span>Danh mục</span>
              <span>{categories.length} nhóm</span>
            </div>
            {categoriesQuery.isPending ? (
              <div className="catalog-category-skeletons" aria-label="Đang tải danh mục">
                {Array.from({ length: 7 }, (_, index) => <span key={index} />)}
              </div>
            ) : categoriesQuery.isError ? (
              <p className="catalog-sidebar-error" role="alert">Không thể tải danh mục. {categoriesQuery.error.message}</p>
            ) : (
              <nav className="catalog-category-list">
                <button
                  type="button"
                  className={!activeCategory ? 'is-active' : ''}
                  onClick={() => selectCategory('')}
                  aria-pressed={!activeCategory}
                >
                  <span>Tất cả đầu sách</span>
                  <small>{categories.reduce((count, category) => count + category.bookCount, 0)}</small>
                </button>
                {categories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    className={activeCategory === category.id ? 'is-active' : ''}
                    onClick={() => selectCategory(category.id)}
                    aria-pressed={activeCategory === category.id}
                    title={category.description || category.name}
                  >
                    <span>{category.name}</span>
                    <small>{category.bookCount}</small>
                  </button>
                ))}
              </nav>
            )}
          </aside>

          <section className="catalog-results" aria-label="Danh sách đầu sách">
            <div className="catalog-results-heading">
              <div>
                <h2>{categoryName || (search ? 'Sách phù hợp với bạn' : 'Tất cả đầu sách')}</h2>
                <p>
                  {search
                    ? `Kết quả phù hợp với “${search}”.`
                    : categoryName
                      ? `Tài liệu thuộc danh mục ${categoryName}.`
                      : 'Khám phá các tài liệu đang được lưu trữ tại thư viện.'}
                </p>
              </div>
              <div className="catalog-result-count" aria-live="polite">
                <LibraryBig aria-hidden="true" />
                {booksQuery.data ? `${booksQuery.data.totalCount.toLocaleString('vi-VN')} đầu sách` : 'Đang cập nhật…'}
              </div>
            </div>

            {(activeCategory || search) && (
              <div className="catalog-active-filters">
                {categoryName && <span>{categoryName}</span>}
                {search && <span>Từ khóa: {search}</span>}
                <button type="button" onClick={clearFilters}><X aria-hidden="true" /> Xóa bộ lọc</button>
              </div>
            )}

            {booksQuery.isPending ? (
              <div className="catalog-book-grid" aria-label="Đang tải đầu sách">
                {Array.from({ length: 8 }, (_, index) => <div className="catalog-book-skeleton" key={index} />)}
              </div>
            ) : booksQuery.isError ? (
              <div className="catalog-message catalog-message--error" role="alert">
                Không thể tải đầu sách. {booksQuery.error.message}
              </div>
            ) : books.length ? (
              <>
                <div className="catalog-book-grid">
                  {books.map((book) => (
                    <BookCard key={book.id} book={toBookCardData(book)} onSelect={() => navigate(`/books/${book.id}`)} />
                  ))}
                </div>
                {booksQuery.data && booksQuery.data.totalPages > 1 && (
                  <div className="catalog-pagination" aria-label="Phân trang đầu sách">
                    <button type="button" disabled={page <= 1 || booksQuery.isFetching} onClick={() => setPage(page - 1)}>
                      <ArrowLeft aria-hidden="true" /> Trang trước
                    </button>
                    <span>Trang {page} / {booksQuery.data.totalPages}</span>
                    <button
                      type="button"
                      disabled={page >= booksQuery.data.totalPages || booksQuery.isFetching}
                      onClick={() => setPage(page + 1)}
                    >
                      Trang sau <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="catalog-message">
                <h3>Chưa tìm thấy đầu sách phù hợp</h3>
                <p>Thử chọn danh mục khác hoặc xóa bộ lọc để xem toàn bộ bộ sưu tập.</p>
                {(activeCategory || search) && <button type="button" onClick={clearFilters}>Xem tất cả đầu sách</button>}
              </div>
            )}
          </section>
        </div>
      </main>
      <footer className="annual-info-footer">
        <span>© 2026 SmartLibrary · FPT University HCMC</span>
      </footer>
    </div>
  );
};

export default HomeCatalogPage;
