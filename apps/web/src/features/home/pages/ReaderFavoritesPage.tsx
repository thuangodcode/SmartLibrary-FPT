import { useNavigate } from 'react-router-dom';
import { Heart, LibraryBig } from 'lucide-react';
import { BookCard } from '../components/BookCard';
import HomeFooter from '../components/HomeFooter';
import HomeNavbar from '../components/HomeNavbar';
import { useReaderFavorites } from '../hooks/useReaderFavorites';
import { toBookCardData } from '../utils/toBookCardData';
import './HomePage.css';
import './HomeCatalogPage.css';
import './ReaderFavoritesPage.css';

export default function ReaderFavoritesPage() {
  const navigate = useNavigate();
  const favoritesQuery = useReaderFavorites();
  const books = favoritesQuery.data ?? [];

  return (
    <div className="annual-home annual-catalog-page reader-favorites-page">
      <HomeNavbar activeSection="catalog" />
      <main className="catalog-main">
        <section className="reader-favorites-heading">
          <div className="reader-favorites-heading__icon"><Heart aria-hidden="true" fill="currentColor" /></div>
          <div>
            <span className="catalog-results-eyebrow">BỘ SƯU TẬP CỦA BẠN</span>
            <h1>Sách yêu thích</h1>
            <p>Lưu lại những đầu sách bạn muốn đọc hoặc mượn sau này.</p>
          </div>
          <div className="catalog-result-count" aria-live="polite">
            <LibraryBig aria-hidden="true" />
            {favoritesQuery.isPending ? 'Đang tải…' : `${books.length} đầu sách`}
          </div>
        </section>

        {favoritesQuery.isPending ? (
          <div className="catalog-book-grid" aria-label="Đang tải danh sách yêu thích">
            {Array.from({ length: 4 }, (_, index) => <div className="catalog-book-skeleton" key={index} />)}
          </div>
        ) : favoritesQuery.isError ? (
          <div className="catalog-message catalog-message--error" role="alert">
            Không thể tải danh sách yêu thích. {favoritesQuery.error.message}
            <button type="button" onClick={() => void favoritesQuery.refetch()}>Thử lại</button>
          </div>
        ) : books.length ? (
          <div className="catalog-book-grid">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={toBookCardData(book)}
                onSelect={() => navigate(`/books/${book.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="catalog-message reader-favorites-empty">
            <Heart aria-hidden="true" />
            <h2>Danh sách của bạn đang trống</h2>
            <p>Chạm vào biểu tượng trái tim trên thẻ sách để lưu những cuốn bạn quan tâm.</p>
            <button type="button" onClick={() => navigate('/books')}>Khám phá sách</button>
          </div>
        )}
      </main>
      <HomeFooter />
    </div>
  );
}
