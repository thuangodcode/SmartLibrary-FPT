import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BookCopy,
  BookOpen,
  Boxes,
  ChevronLeft,
  ChevronRight,
  LibraryBig,
  LoaderCircle,
  Search,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminCollectionPage.css';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  meta?: {
    totalCount?: number;
    totalPages?: number;
  };
  pagination?: {
    totalCount?: number;
    totalPages?: number;
  };
}

interface Category {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  bookCount: number;
}

interface Book {
  id: string;
  code: string;
  title: string;
  coverImageUrl?: string | null;
  publishedYear?: number | null;
  language?: string;
  totalCopies: number;
  availableCopies: number;
  authorNames: string[];
}

const PAGE_SIZE = 12;
const number = (value: number) => value.toLocaleString('vi-VN');

const AdminCollectionPage: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.accessToken);
  const [categories, setCategories] = useState<Category[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [totalBooks, setTotalBooks] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [booksDataKey, setBooksDataKey] = useState('');

  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;
  const filteredCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi');
    if (!query) return categories;
    return categories.filter((category) =>
      category.name.toLocaleLowerCase('vi').includes(query) ||
      (category.description ?? '').toLocaleLowerCase('vi').includes(query));
  }, [categories, search]);

  const loadCategories = useCallback(async (signal?: AbortSignal) => {
    if (!token) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      setLoadingCategories(false);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/categories`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const result = await parseApiResponse<ApiEnvelope<Category[]>>(response);
      if (!response.ok || !result?.success || !Array.isArray(result.data)) {
        throw new Error(result?.error || `Không tải được danh mục (HTTP ${response.status}).`);
      }
      setCategories(result.data);
    } catch (caught) {
      if (signal?.aborted) return;
      console.error('Error loading admin collection categories:', caught);
      setError(caught instanceof Error ? caught.message : 'Không thể tải danh mục sách.');
    } finally {
      if (!signal?.aborted) setLoadingCategories(false);
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadCategories(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadCategories, refreshKey]);

  useEffect(() => {
    if (!categoryId || !selectedCategory || !token) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingBooks(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          categoryId,
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (search.trim()) params.set('search', search.trim());
        const response = await fetch(`${API_BASE_URL}/api/v1/books?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const result = await parseApiResponse<ApiEnvelope<Book[]>>(response);
        if (!response.ok || !result?.success || !Array.isArray(result.data)) {
          throw new Error(result?.error || `Không tải được đầu sách (HTTP ${response.status}).`);
        }
        setBooks(result.data);
        setBooksDataKey(`${categoryId}|${page}|${search.trim()}`);
        const count = result.meta?.totalCount ?? result.pagination?.totalCount ?? result.data.length;
        const pages = result.meta?.totalPages ?? result.pagination?.totalPages ?? 1;
        setTotalBooks(count);
        setTotalPages(Math.max(1, pages));
      } catch (caught) {
        if (controller.signal.aborted) return;
        console.error('Error loading admin collection books:', caught);
        setError(caught instanceof Error ? caught.message : 'Không thể tải đầu sách.');
      } finally {
        if (!controller.signal.aborted) setLoadingBooks(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [categoryId, page, refreshKey, search, selectedCategory, token]);

  const totalCatalogTitles = categories.reduce((total, category) => total + category.bookCount, 0);
  const displayingBooks = booksDataKey === `${categoryId}|${page}|${search.trim()}`;
  const retry = () => {
    setError(null);
    setLoadingCategories(true);
    setLoadingBooks(Boolean(categoryId));
    setRefreshKey((current) => current + 1);
  };

  return (
    <main className="admin-collection-page">
      <header className="admin-collection-hero">
        <div className="admin-collection-hero-mark"><Boxes size={23} /></div>
        <div>
          <span className="admin-collection-eyebrow">QUẢN TRỊ HỆ THỐNG · KHO SÁCH</span>
          <h1>{selectedCategory?.name ?? 'Kho sách'}</h1>
          <p>
            {selectedCategory
              ? selectedCategory.description || 'Danh sách đầu sách và số lượng bản sao thuộc danh mục này.'
              : 'Xem danh mục sách hiện có và số lượng tài liệu trong kho thư viện.'}
          </p>
        </div>
        {selectedCategory && (
          <button type="button" className="admin-collection-back" onClick={() => navigate('/admin/collection')}>
            <ArrowLeft size={16} /> Tất cả danh mục
          </button>
        )}
      </header>

      {error && (
        <div className="admin-collection-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={retry}>Thử lại</button>
        </div>
      )}

      {!categoryId && (
        <>
          <section className="admin-collection-stats" aria-label="Tổng quan kho sách">
            <article><span className="admin-collection-stat-icon orange"><Boxes size={19} /></span><div><small>Danh mục hiện có</small><strong>{number(categories.length)}</strong></div></article>
            <article><span className="admin-collection-stat-icon blue"><BookOpen size={19} /></span><div><small>Đầu sách trong danh mục</small><strong>{number(totalCatalogTitles)}</strong></div></article>
            <article><span className="admin-collection-stat-icon green"><LibraryBig size={19} /></span><div><small>Chế độ</small><strong className="admin-collection-readonly">Chỉ xem</strong></div></article>
          </section>

          <section className="admin-collection-panel">
            <div className="admin-collection-panel-heading">
              <div><span>DANH MỤC THƯ VIỆN</span><h2>Chọn danh mục sách</h2></div>
              <label className="admin-collection-search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => { setPage(1); setSearch(event.target.value); }}
                  placeholder="Tìm danh mục..."
                  aria-label="Tìm danh mục sách"
                />
              </label>
            </div>

            {loadingCategories ? (
              <div className="admin-collection-loading"><LoaderCircle size={22} /> Đang tải danh mục...</div>
            ) : filteredCategories.length ? (
              <div className="admin-collection-category-grid">
                {filteredCategories.map((category, index) => (
                  <button
                    className="admin-collection-category-card"
                    type="button"
                    key={category.id}
                    onClick={() => { setPage(1); setSearch(''); navigate(`/admin/collection/${category.id}`); }}
                  >
                    <span
                      className={`admin-collection-category-art art-${index % 5}`}
                      style={category.imageUrl ? { backgroundImage: `linear-gradient(180deg, transparent, rgb(25 35 55 / 35%)), url("${category.imageUrl}")` } : undefined}
                    >
                      {!category.imageUrl && <BookOpen size={27} />}
                    </span>
                    <span className="admin-collection-category-info">
                      <strong>{category.name}</strong>
                      <small>{number(category.bookCount)} đầu sách</small>
                    </span>
                    <ChevronRight size={17} className="admin-collection-category-chevron" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="admin-collection-empty">
                <Boxes size={25} />
                <strong>{categories.length ? 'Không tìm thấy danh mục' : 'Chưa có danh mục sách'}</strong>
                <span>{categories.length ? 'Thử từ khóa khác.' : 'Danh mục sách sẽ xuất hiện tại đây khi được tạo.'}</span>
              </div>
            )}
          </section>
        </>
      )}

      {categoryId && (
        <section className="admin-collection-panel">
          <div className="admin-collection-panel-heading">
            <div>
              <span>ĐẦU SÁCH TRONG DANH MỤC</span>
              <h2>{selectedCategory ? `${selectedCategory.name} · ${number(totalBooks)} đầu sách` : 'Đầu sách'}</h2>
            </div>
            <label className="admin-collection-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => { setPage(1); setSearch(event.target.value); }}
                placeholder="Tìm tên hoặc mã sách..."
                aria-label="Tìm đầu sách"
              />
            </label>
          </div>

          {loadingCategories || (selectedCategory && (loadingBooks || !displayingBooks)) ? (
            <div className="admin-collection-loading"><LoaderCircle size={22} /> Đang tải đầu sách...</div>
          ) : !selectedCategory ? (
            <div className="admin-collection-empty">
              <Boxes size={25} />
              <strong>Không tìm thấy danh mục</strong>
              <span>Danh mục có thể đã bị xóa hoặc đường dẫn không hợp lệ.</span>
            </div>
          ) : books.length ? (
            <>
              <div className="admin-collection-book-list">
                {books.map((book) => (
                  <article className="admin-collection-book-row" key={book.id}>
                    {book.coverImageUrl
                      ? <img className="admin-collection-book-cover" src={book.coverImageUrl} alt="" loading="lazy" />
                      : <span className="admin-collection-book-cover admin-collection-book-placeholder"><BookOpen size={22} /></span>}
                    <div className="admin-collection-book-details">
                      <strong>{book.title}</strong>
                      <span>{book.authorNames?.length ? book.authorNames.join(', ') : 'Chưa có thông tin tác giả'}</span>
                      <small>Mã sách: {book.code}{book.publishedYear ? ` · ${book.publishedYear}` : ''}</small>
                    </div>
                    <div className="admin-collection-copy-count">
                      <BookCopy size={17} />
                      <div><strong>{number(book.totalCopies)}</strong><small>bản sao</small></div>
                    </div>
                    <span className="admin-collection-available">{number(book.availableCopies)} sẵn sàng</span>
                  </article>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="admin-collection-pagination">
                  <span>{number(totalBooks)} đầu sách · Trang {page}/{totalPages}</span>
                  <div>
                    <button type="button" aria-label="Trang trước" disabled={page <= 1 || loadingBooks} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={17} /></button>
                    <button type="button" aria-label="Trang sau" disabled={page >= totalPages || loadingBooks} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}><ChevronRight size={17} /></button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="admin-collection-empty">
              <BookOpen size={25} />
              <strong>{error ? 'Không thể hiển thị đầu sách' : 'Danh mục chưa có đầu sách'}</strong>
              <span>{error ? 'Thử tải lại trang hoặc quay lại sau.' : 'Các đầu sách thuộc danh mục này sẽ xuất hiện tại đây.'}</span>
            </div>
          )}
        </section>
      )}
    </main>
  );
};

export default AdminCollectionPage;
