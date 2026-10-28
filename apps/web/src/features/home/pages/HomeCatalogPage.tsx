import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, LibraryBig, Star, X } from "lucide-react";
import { BookCard } from "../components/BookCard";
import HomeFooter from "../components/HomeFooter";
import HomeNavbar from "../components/HomeNavbar";
import { useHomeBookHighlights, useHomeBooks, useHomeCategories, type HomeBook } from "../hooks/useHomeData";
import { toBookCardData } from "../utils/toBookCardData";
import "./HomePage.css";
import "./HomeCatalogPage.css";

const HomeCatalogPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeCategory = searchParams.get("category") ?? "";
  const search = searchParams.get("q") ?? "";
  const isRecommendations = searchParams.get("view") === "recommended";
  const sortByReviewCount = searchParams.get("sort")?.startsWith("reviews") ?? false;
  const reviewCountAscending = searchParams.get("sort") === "reviews-asc";
  const requestedPage = Number(searchParams.get("page") ?? 1);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const categoriesQuery = useHomeCategories();
  const booksQuery = useHomeBooks(activeCategory, search, page, !isRecommendations, sortByReviewCount, reviewCountAscending);
  const highlightsQuery = useHomeBookHighlights(isRecommendations);
  const categories = categoriesQuery.data ?? [];
  const categoryName = categories.find(
    (category) => category.id === activeCategory,
  )?.name;
  const books = booksQuery.data?.books ?? [];

  const selectCategory = (categoryId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (categoryId) nextParams.set("category", categoryId);
    else nextParams.delete("category");
    nextParams.delete("page");
    setSearchParams(nextParams);
  };

  const clearFilters = () => setSearchParams({});

  const setPage = (nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage > 1) nextParams.set("page", String(nextPage));
    else nextParams.delete("page");
    setSearchParams(nextParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleReviewSort = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("sort", !sortByReviewCount ? "reviews-desc" : reviewCountAscending ? "reviews-desc" : "reviews-asc");
    nextParams.delete("page");
    setSearchParams(nextParams);
  };

  const clearReviewSort = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("sort");
    nextParams.delete("page");
    setSearchParams(nextParams);
  };

  return (
    <div className="annual-home annual-catalog-page">
      <HomeNavbar activeSection={isRecommendations ? "recommendations" : "catalog"} />
      <main className="catalog-main">
        {isRecommendations ? (
          <section className="catalog-featured-page" aria-labelledby="featured-books-title">
            <span className="catalog-results-eyebrow">ĐƯỢC ĐỘC GIẢ YÊU THÍCH</span>
            <h1 id="featured-books-title">Gợi ý sách nổi bật</h1>
            <p className="catalog-featured-intro">Khám phá sách được đánh giá cao và những tựa sách có nhiều lượt mượn trong thư viện.</p>
            {highlightsQuery.isPending ? (
              <div className="catalog-featured-section"><h2>Đang tải sách nổi bật…</h2><div className="catalog-book-grid">{Array.from({ length: 4 }, (_, index) => <div className="catalog-book-skeleton" key={index}/>)}</div></div>
            ) : highlightsQuery.isError ? (
              <div className="catalog-message catalog-message--error" role="alert">Không tải được sách nổi bật. {highlightsQuery.error.message}</div>
            ) : (
              <>
                <FeaturedBookGroup title="Được đánh giá cao" description="Xếp theo điểm đánh giá và số lượt nhận xét." books={highlightsQuery.data?.topRated ?? []} empty="Chưa có sách được đánh giá." onSelect={(id) => navigate(`/books/${id}`)} />
                <FeaturedBookGroup title="Được mượn nhiều" description="Xếp theo tổng lượt mượn đã ghi nhận." books={highlightsQuery.data?.mostBorrowed ?? []} empty="Chưa có dữ liệu lượt mượn." onSelect={(id) => navigate(`/books/${id}`)} />
              </>
            )}
          </section>
        ) : (
          <>
        <section
          className="catalog-mobile-categories"
          aria-label="Danh mục sách nổi bật"
        >
          <div className="catalog-mobile-categories__heading">
            <h2>Duyệt theo danh mục</h2>
            <span>{categories.length} nhóm</span>
          </div>
          <div className="catalog-mobile-categories__rail">
            <button
              type="button"
              className={!activeCategory ? "is-active" : ""}
              onClick={() => selectCategory("")}
            >
              Tất cả
            </button>
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={activeCategory === category.id ? "is-active" : ""}
                onClick={() => selectCategory(category.id)}
              >
                {category.name}
                <small>{category.bookCount}</small>
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
              <div
                className="catalog-category-skeletons"
                aria-label="Đang tải danh mục"
              >
                {Array.from({ length: 7 }, (_, index) => (
                  <span key={index} />
                ))}
              </div>
            ) : categoriesQuery.isError ? (
              <p className="catalog-sidebar-error" role="alert">
                Không thể tải danh mục. {categoriesQuery.error.message}
              </p>
            ) : (
              <nav className="catalog-category-list">
                <button
                  type="button"
                  className={!activeCategory ? "is-active" : ""}
                  onClick={() => selectCategory("")}
                  aria-pressed={!activeCategory}
                >
                  <span>Tất cả đầu sách</span>
                  <small>
                    {categories.reduce(
                      (count, category) => count + category.bookCount,
                      0,
                    )}
                  </small>
                </button>
                {categories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    className={
                      activeCategory === category.id ? "is-active" : ""
                    }
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
                <h2>
                  {categoryName ||
                    (search ? "Kết quả tìm kiếm" : "Tất cả đầu sách")}
                </h2>
                <p>
                  {search
                    ? `Kết quả phù hợp với “${search}”.`
                    : categoryName
                      ? `Tài liệu thuộc danh mục ${categoryName}.`
                      : "Khám phá các tài liệu đang được lưu trữ tại thư viện."}
                </p>
              </div>
              <div className="catalog-result-count" aria-live="polite">
                <LibraryBig aria-hidden="true" />
                {booksQuery.data
                  ? `${booksQuery.data.totalCount.toLocaleString("vi-VN")} đầu sách`
                  : "Đang cập nhật…"}
              </div>
            </div>

            <div className="catalog-sort-toolbar" aria-label="Sắp xếp sách">
              <span><Star aria-hidden="true" /> Sắp xếp theo</span>
              <button type="button" className={`catalog-sort-button${sortByReviewCount ? " is-active" : ""}`} aria-pressed={sortByReviewCount} onClick={toggleReviewSort}>
                {sortByReviewCount && (reviewCountAscending ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />)}
                Lượt đánh giá {sortByReviewCount ? (reviewCountAscending ? "· ít trước" : "· nhiều trước") : ""}
              </button>
              {sortByReviewCount && <button type="button" className="catalog-sort-reset" onClick={clearReviewSort}>Mặc định</button>}
            </div>

            {(activeCategory || search || sortByReviewCount) && (
              <div className="catalog-active-filters">
                {categoryName && <span>{categoryName}</span>}
                {search && <span>Từ khóa: {search}</span>}
                {sortByReviewCount && <span>{reviewCountAscending ? "Ít lượt đánh giá trước" : "Nhiều lượt đánh giá trước"}</span>}
                <button type="button" onClick={clearFilters}>
                  <X aria-hidden="true" /> Xóa bộ lọc
                </button>
              </div>
            )}

            {booksQuery.isPending ? (
              <div className="catalog-book-grid" aria-label="Đang tải đầu sách">
                {Array.from({ length: 8 }, (_, index) => (
                  <div className="catalog-book-skeleton" key={index} />
                ))}
              </div>
            ) : booksQuery.isError ? (
              <div
                className="catalog-message catalog-message--error"
                role="alert"
              >
                Không thể tải đầu sách. {booksQuery.error.message}
              </div>
            ) : books.length ? (
              <>
                <div className="catalog-book-grid">
                  {books.map((book) => (
                    <BookCard
                      key={book.id}
                      book={toBookCardData(book)}
                      onSelect={() => navigate(`/books/${book.id}`)}
                    />
                  ))}
                </div>
                {booksQuery.data && booksQuery.data.totalPages > 1 && (
                  <div
                    className="catalog-pagination"
                    aria-label="Phân trang đầu sách"
                  >
                    <button
                      type="button"
                      disabled={page <= 1 || booksQuery.isFetching}
                      onClick={() => setPage(page - 1)}
                    >
                      <ArrowLeft aria-hidden="true" /> Trang trước
                    </button>
                    <span>
                      Trang {page} / {booksQuery.data.totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={
                        page >= booksQuery.data.totalPages ||
                        booksQuery.isFetching
                      }
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
                <p>
                  Thử chọn danh mục khác hoặc xóa bộ lọc để xem toàn bộ bộ sưu
                  tập.
                </p>
                {(activeCategory || search) && (
                  <button type="button" onClick={clearFilters}>
                    Xem tất cả đầu sách
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
          </>
        )}
      </main>
      <HomeFooter />
    </div>
  );
};

const FeaturedBookGroup: React.FC<{
  title: string;
  description: string;
  books: HomeBook[];
  empty: string;
  onSelect: (id: string) => void;
}> = ({ title, description, books, empty, onSelect }) => (
  <section className="catalog-featured-section">
    <div className="catalog-featured-section-heading"><div><h2>{title}</h2><p>{description}</p></div><span>{books.length} sách</span></div>
    {books.length ? <div className="catalog-book-grid">{books.map((book) => <BookCard key={book.id} book={toBookCardData(book)} onSelect={() => onSelect(book.id)}/>)}</div> : <p className="catalog-featured-empty">{empty}</p>}
  </section>
);

export default HomeCatalogPage;
