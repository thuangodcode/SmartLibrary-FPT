import { useNavigate, useSearchParams } from 'react-router-dom';
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
        <header className="catalog-heading">
          <div>
            <span className="catalog-eyebrow">SMARTLIBRARY · FPT UNIVERSITY</span>
            <h1>Khám phá tri thức</h1>
            <p>Tìm kiếm sách và tài liệu trong bộ sưu tập của thư viện.</p>
          </div>
        </header>

        <div className="catalog-layout">
          <aside className="catalog-sidebar" aria-label="Lọc theo danh mục">
            <div className="catalog-sidebar-heading">
              <span>Danh mục sách</span>
              <span>{categories.length}</span>
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
                <span className="catalog-results-eyebrow">{search ? 'KẾT QUẢ TÌM KIẾM' : 'BỘ SƯU TẬP'}</span>
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
                {booksQuery.data ? `${booksQuery.data.totalCount.toLocaleString('vi-VN')} đầu sách` : 'Đang cập nhật…'}
              </div>
            </div>

            {(activeCategory || search) && (
              <div className="catalog-active-filters">
                {categoryName && <span>{categoryName}</span>}
                {search && <span>Từ khóa: {search}</span>}
                <button type="button" onClick={clearFilters}>Xóa bộ lọc</button>
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
                      Trang trước
                    </button>
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
