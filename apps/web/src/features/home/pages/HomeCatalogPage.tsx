import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, LibraryBig, X } from "lucide-react";
import { getPersonalizedRecommendations, type AiBookSuggestion } from "../../ai/aiApi";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { BookCard } from "../components/BookCard";
import HomeNavbar from "../components/HomeNavbar";
import RagAskPanel from "../components/RagAskPanel";
import { useHomeBooks, useHomeCategories } from "../hooks/useHomeData";
import { toBookCardData, toBookFromSuggestion } from "../utils/toBookCardData";
import "./HomePage.css";
import "./HomeCatalogPage.css";

const HomeCatalogPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeCategory = searchParams.get("category") ?? "";
  const search = searchParams.get("q") ?? "";
  const requestedPage = Number(searchParams.get("page") ?? 1);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const categoriesQuery = useHomeCategories();
  const booksQuery = useHomeBooks(activeCategory, search, page);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [personalized, setPersonalized] = useState<AiBookSuggestion[]>([]);
  const [personalizedNote, setPersonalizedNote] = useState<string | null>(null);
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

  useEffect(() => {
    if (!accessToken) {
      setPersonalized([]);
      setPersonalizedNote(null);
      return;
    }

    let cancelled = false;
    void getPersonalizedRecommendations(accessToken)
      .then((items) => {
        if (cancelled) return;
        setPersonalized(items);
        setPersonalizedNote(items.length === 0
          ? 'Chưa có đủ dữ liệu cá nhân hóa. Gợi ý sẽ xuất hiện khi có sở thích đọc, đánh giá hoặc lịch sử mượn.'
          : null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPersonalized([]);
        const message = error instanceof Error ? error.message : '';
        setPersonalizedNote(/tắt/i.test(message)
          ? 'Gợi ý sách cá nhân hóa đang tắt. Liên hệ Admin nếu cần bật.'
          : null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const setPage = (nextPage: number) => {
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage > 1) nextParams.set("page", String(nextPage));
    else nextParams.delete("page");
    setSearchParams(nextParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="annual-home annual-catalog-page">
      <HomeNavbar activeSection="catalog" />
      <main className="catalog-main">
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
            <RagAskPanel />
            {!search && (personalized.length > 0 || personalizedNote) && (
              <section className="catalog-personalized" aria-label="Gợi ý sách cá nhân hóa">
                <div className="catalog-results-heading">
                  <div>
                    <span className="catalog-results-eyebrow">GỢI Ý CÁ NHÂN HÓA</span>
                    <h2>Sách phù hợp với bạn</h2>
                    <p>Tách riêng khỏi tìm kiếm. Chỉ dùng sách thật và dữ liệu đọc được phép truy cập.</p>
                  </div>
                </div>
                {personalizedNote && <p className="catalog-message">{personalizedNote}</p>}
                {personalized.length > 0 && (
                  <div className="catalog-book-grid">
                    {personalized.slice(0, 4).map((item) => (
                      <BookCard
                        key={item.id}
                        book={toBookFromSuggestion(item)}
                        onSelect={() => navigate(`/books/${item.id}`)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
            <div className="catalog-results-heading">
              <div>
                <h2>
                  {categoryName ||
                    (search ? "Sách phù hợp với bạn" : "Tất cả đầu sách")}
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

            {(activeCategory || search) && (
              <div className="catalog-active-filters">
                {categoryName && <span>{categoryName}</span>}
                {search && <span>Từ khóa: {search}</span>}
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
      </main>
      <footer className="annual-info-footer">
        <span>© 2026 SmartLibrary · FPT University HCMC</span>
      </footer>
    </div>
  );
};

export default HomeCatalogPage;
