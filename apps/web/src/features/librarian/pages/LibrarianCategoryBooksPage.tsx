import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Search,
  BookMarked,
  Layers,
  Calendar,
  Globe,
  AlertCircle,
  Copy,
  RefreshCw,
  Pencil,
  Trash2,
  Plus,
  UploadCloud,
  X,
  Image as ImageIcon,
  FileText,
  User,
  Barcode,
  HelpCircle,
  MapPin,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { parseApiResponse } from '../../../lib/api';
import { STORAGE_LOCATIONS } from '../storageLocations';
import type { CategoryItem } from './LibrarianCategoriesPage';
import './LibrarianCategoryBooksPage.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5278';
const BOOK_CODE_PATTERN = /^[a-zA-Z0-9]{1,32}$/;

type BookCodeAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';

export interface BookItem {
  id: string;
  code: string;
  title: string;
  isbn?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  publishedYear?: number | null;
  language?: string;
  totalCopies: number;
  availableCopies: number;
  averageRating: number;
  authorNames: string[];
  categoryNames: string[];
  createdAt: string;
}

// SVG Icon Components from user's template
const ClockIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// The Book Card Component (styled following the NFT Card model)
const BookCard: React.FC<{ book: BookItem }> = ({ book }) => {
  const navigate = useNavigate();
  const authorDisplay =
    book.authorNames && book.authorNames.length > 0
      ? book.authorNames.join(', ')
      : 'Chưa rõ tác giả';

  return (
    <div
      onClick={() => navigate(`/librarian/books/${book.id}`)}
      className="relative group overflow-hidden rounded-2xl sm:rounded-3xl bg-white dark:bg-black border border-gray-200 dark:border-gray-800 shadow-lg shadow-gray-200/50 dark:shadow-black/20 transition-all duration-300 hover:shadow-xl hover:shadow-gray-300/50 dark:hover:shadow-black/40 hover:-translate-y-1 hover:border-gray-300 dark:hover:border-gray-700 w-full font-space-grotesk cursor-pointer"
      title={`Xem chi tiết đầu sách "${book.title}"`}
    >
      <div className="relative p-2 sm:p-2.5">
        {/* Card Image Section */}
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl aspect-square bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
          {book.coverImageUrl ? (
            <img
              src={book.coverImageUrl}
              alt={book.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full rounded-xl sm:rounded-2xl object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-slate-400 p-4 text-center rounded-xl sm:rounded-2xl">
              <BookOpen className="w-12 h-12 text-slate-500 mb-2" />
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-300 line-clamp-2">
                {book.title}
              </span>
            </div>
          )}

          {/* Overlays: Top Left Stock/Copies */}
          <div className="absolute top-2 left-2 sm:top-4 sm:left-4 bg-black/70 dark:bg-black/70 text-white text-xs sm:text-sm font-semibold px-2 py-1 sm:px-4 sm:py-2 rounded-full flex items-center space-x-1 sm:space-x-2 backdrop-blur-sm border border-white/20">
            <ClockIcon className="w-3 h-3 sm:w-5 sm:h-5 text-cyan-300" />
            <span className="hidden sm:inline">
              {book.availableCopies} / {book.totalCopies} sẵn sàng
            </span>
            <span className="sm:hidden">
              {book.availableCopies}/{book.totalCopies}
            </span>
          </div>
        </div>

        {/* Card Content Section */}
        <div className="mt-3 sm:mt-4 px-1 sm:px-1.5 pb-2 sm:pb-3 pt-1 sm:pt-2">
          <div className="flex justify-between items-center">
            <h3
              className="text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate pr-2 group-hover:text-sky-600 transition-colors"
              title={book.title}
            >
              {book.title}
            </h3>
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500 dark:text-gray-400 flex-shrink-0 group-hover:text-sky-500 transition-colors" />
          </div>

          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 truncate" title={authorDisplay}>
            Tác giả: {authorDisplay}
          </p>

          <p className="mt-1 text-[11px] font-semibold tracking-wide text-slate-500">
            Mã sách: {book.code}
          </p>

          <div className="mt-3 sm:mt-4 flex justify-between items-center">
            <p className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300">
              {book.publishedYear ? `Năm: ${book.publishedYear}` : (book.language ? `Ngôn ngữ: ${book.language.toUpperCase()}` : 'Kho sách')}
            </p>
            <p className={`text-sm sm:text-lg font-bold ${book.availableCopies > 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-red-500'}`}>
              {book.availableCopies > 0 ? `Còn ${book.availableCopies} cuốn` : 'Hết sách'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const LibrarianCategoryBooksPage: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { showToast } = useToast();

  // Category details
  const [category, setCategory] = useState<CategoryItem | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const initialRequestsRef = useRef({ category: false, books: false });

  // Books list
  const [books, setBooks] = useState<BookItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(12);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Confirmation modals state (Confirmation before edit & before delete)
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(false);

  // Edit category modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editRemoveImage, setEditRemoveImage] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Add Book modal states
  const [isAddBookModalOpen, setIsAddBookModalOpen] = useState(false);
  const [bookTitle, setBookTitle] = useState('');
  const [bookCode, setBookCode] = useState('');
  const [bookCodeAvailability, setBookCodeAvailability] = useState<BookCodeAvailability>('idle');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookIsbn, setBookIsbn] = useState('');
  const [bookYear, setBookYear] = useState('');
  const [bookLanguage, setBookLanguage] = useState('vi');
  const [customBookLanguage, setCustomBookLanguage] = useState('');
  const [bookTotalCopies, setBookTotalCopies] = useState(1);
  const [bookLocation, setBookLocation] = useState('');
  const [bookDescription, setBookDescription] = useState('');
  const [bookCoverFile, setBookCoverFile] = useState<File | null>(null);
  const [bookCoverPreview, setBookCoverPreview] = useState<string | null>(null);
  const [savingBook, setSavingBook] = useState(false);

  const editFileInputRef = useRef<HTMLInputElement>(null);
  const bookCoverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const code = bookCode.trim();
    if (!isAddBookModalOpen || !code || !BOOK_CODE_PATTERN.test(code)) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const params = new URLSearchParams({ code });
        const response = await fetch(`${API_BASE_URL}/api/v1/books/code-availability?${params}`, { headers });
        const result = await parseApiResponse<{
          success?: boolean;
          data?: { available: boolean };
          error?: string;
        }>(response);
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.error || 'Không thể kiểm tra mã sách.');
        }
        if (!cancelled) {
          setBookCodeAvailability(result.data.available ? 'available' : 'taken');
        }
      } catch {
        if (!cancelled) setBookCodeAvailability('error');
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, bookCode, isAddBookModalOpen]);

  const markInitialRequestComplete = (request: 'category' | 'books') => {
    initialRequestsRef.current[request] = true;
    if (initialRequestsRef.current.category && initialRequestsRef.current.books) {
      setInitialLoading(false);
    }
  };

  // Debounce search
  useEffect(() => {
    if (searchTerm === debouncedSearch) return;
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  // Fetch Category info
  const fetchCategoryInfo = useCallback(async () => {
    if (!categoryId) return;
    setLoadingCategory(true);
    setCategoryError(null);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/categories/${categoryId}`, { headers });
      const json = await parseApiResponse<{ success?: boolean; data?: CategoryItem; error?: string }>(res);
      if (!res.ok || !json?.data) {
        throw new Error(json?.error || 'Không tìm thấy danh mục sách.');
      }
      setCategory(json.data);
    } catch (err) {
      console.error('Error fetching category info:', err);
      setCategoryError(err instanceof Error ? err.message : 'Không thể tải thông tin danh mục sách.');
    } finally {
      setLoadingCategory(false);
      markInitialRequestComplete('category');
    }
  }, [categoryId, accessToken]);

  // Fetch Books belonging to this category
  const fetchCategoryBooks = useCallback(async () => {
    if (!categoryId) return;
    setLoadingBooks(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
        categoryId: categoryId,
      });

      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim());
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/books?${params.toString()}`, { headers });
      const json = await parseApiResponse<{
        success?: boolean;
        data?: BookItem[];
        pagination?: {
          totalCount: number;
          page: number;
          pageSize: number;
          totalPages: number;
          hasPrevious: boolean;
          hasNext: boolean;
        };
        error?: string;
      }>(res);

      if (json && json.data) {
        setBooks(json.data);
        if (json.pagination) {
          setTotalCount(json.pagination.totalCount);
          setTotalPages(json.pagination.totalPages);
        } else {
          setTotalCount(json.data.length);
          setTotalPages(1);
        }
      } else {
        setBooks([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch (err: any) {
      console.error('Error fetching category books:', err);
      setError('Không thể tải danh sách đầu sách thuộc danh mục này.');
    } finally {
      setLoadingBooks(false);
      markInitialRequestComplete('books');
    }
  }, [categoryId, currentPage, pageSize, debouncedSearch, accessToken]);

  useEffect(() => {
    fetchCategoryInfo();
  }, [fetchCategoryInfo]);

  useEffect(() => {
    fetchCategoryBooks();
  }, [fetchCategoryBooks]);

  // Step 1 of Edit: Prompt confirmation modal
  const handleRequestEdit = () => {
    setConfirmEditOpen(true);
  };

  // Step 2 of Edit: Once confirmed, open the actual edit form
  const handleProceedToEdit = () => {
    setConfirmEditOpen(false);
    if (!category) return;
    setEditName(category.name);
    setEditDescription(category.description || '');
    setEditImageFile(null);
    setEditImagePreview(category.imageUrl || null);
    setEditRemoveImage(false);
    setIsEditModalOpen(true);
  };

  // Close Edit Form
  const handleCloseEdit = () => {
    if (editImageFile && editImagePreview && !category?.imageUrl) {
      URL.revokeObjectURL(editImagePreview);
    }
    setIsEditModalOpen(false);
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditRemoveImage(false);
  };

  // File change in Edit
  const handleEditFileChange = (file: File | null) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showToast({
        type: 'error',
        title: 'Định dạng không hợp lệ',
        message: 'Chỉ chấp nhận các tệp ảnh JPG, PNG, WEBP hoặc GIF.',
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast({
        type: 'error',
        title: 'Ảnh quá lớn',
        message: 'Dung lượng ảnh không được vượt quá 10MB.',
      });
      return;
    }

    setEditImageFile(file);
    setEditRemoveImage(false);
    setEditImagePreview(URL.createObjectURL(file));
  };

  // Submit Category Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !categoryId) return;

    const trimmed = editName.trim();
    if (!trimmed) {
      showToast({
        type: 'warning',
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập tên danh mục sách.',
      });
      return;
    }

    setSavingEdit(true);
    try {
      const formData = new FormData();
      formData.append('Name', trimmed);
      if (editDescription.trim()) {
        formData.append('Description', editDescription.trim());
      }
      if (editImageFile) {
        formData.append('Image', editImageFile);
      }
      if (editRemoveImage) {
        formData.append('RemoveImage', 'true');
      }

      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/categories/${categoryId}`, {
        method: 'PUT',
        headers,
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'Không thể cập nhật danh mục sách.');
      }

      showToast({
        type: 'success',
        title: 'Thành công',
        message: `Đã cập nhật thông tin danh mục "${trimmed}" thành công!`,
      });

      if (data?.data) {
        setCategory(data.data);
      } else {
        setCategory((prev) =>
          prev
            ? {
                ...prev,
                name: trimmed,
                description: editDescription.trim() || null,
                imageUrl: editRemoveImage ? null : editImagePreview || prev.imageUrl,
              }
            : null
        );
      }

      handleCloseEdit();
    } catch (err: any) {
      console.error('Error updating category:', err);
      showToast({
        type: 'error',
        title: 'Cập nhật thất bại',
        message: err.message || 'Có lỗi xảy ra khi lưu thay đổi.',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Category (after confirmation)
  const handleDeleteCategory = async () => {
    if (!category || !categoryId) return;
    setDeletingCategory(true);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/categories/${categoryId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || data?.message || 'Xóa danh mục thất bại.');
      }

      showToast({
        type: 'success',
        title: 'Đã xóa danh mục',
        message: `Đã xóa danh mục "${category.name}" thành công!`,
      });

      setConfirmDeleteOpen(false);
      navigate('/librarian/books');
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Lỗi xóa danh mục',
        message: err.message || 'Có lỗi xảy ra khi xóa danh mục.',
      });
    } finally {
      setDeletingCategory(false);
    }
  };

  // File change in Add Book
  const handleBookCoverChange = (file: File | null) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showToast({
        type: 'error',
        title: 'Định dạng không hợp lệ',
        message: 'Chỉ chấp nhận các tệp ảnh JPG, PNG, WEBP hoặc GIF.',
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast({
        type: 'error',
        title: 'Ảnh quá lớn',
        message: 'Dung lượng ảnh không được vượt quá 10MB.',
      });
      return;
    }

    setBookCoverFile(file);
    setBookCoverPreview(URL.createObjectURL(file));
  };

  // Submit Add Book
  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) return;

    const trimmedTitle = bookTitle.trim();
    if (!trimmedTitle) {
      showToast({
        type: 'warning',
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập tiêu đề sách.',
      });
      return;
    }

    const trimmedCode = bookCode.trim();
    if (!BOOK_CODE_PATTERN.test(trimmedCode) || bookCodeAvailability !== 'available') {
      showToast({
        type: 'warning',
        title: 'Mã sách chưa hợp lệ',
        message: bookCodeAvailability === 'taken'
          ? 'Mã sách đã được sử dụng. Vui lòng chọn mã khác.'
          : bookCodeAvailability === 'error'
            ? 'Chưa kiểm tra được mã sách. Hãy thử lại trước khi lưu.'
            : 'Nhập mã gồm 1–32 chữ cái hoặc chữ số và chờ hệ thống xác nhận chưa được sử dụng.',
      });
      return;
    }

    const language = bookLanguage === 'custom' ? customBookLanguage.trim() : bookLanguage;
    if (!language) {
      showToast({
        type: 'warning',
        title: 'Thiếu ngôn ngữ',
        message: 'Vui lòng chọn hoặc nhập ngôn ngữ của sách.',
      });
      return;
    }

    setSavingBook(true);
    try {
      const formData = new FormData();
      formData.append('Code', trimmedCode);
      formData.append('Title', trimmedTitle);
      if (bookAuthor.trim()) formData.append('AuthorName', bookAuthor.trim());
      if (bookIsbn.trim()) formData.append('Isbn', bookIsbn.trim());
      if (bookYear) formData.append('PublishedYear', bookYear);
      formData.append('Language', language);
      formData.append('TotalCopies', String(Math.max(1, bookTotalCopies || 1)));
      if (bookLocation) formData.append('Location', bookLocation);
      if (bookDescription.trim()) formData.append('Description', bookDescription.trim());
      formData.append('CategoryId', categoryId);
      if (bookCoverFile) formData.append('CoverImage', bookCoverFile);

      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/books/form`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || json?.message || 'Không thể thêm đầu sách.');
      }

      showToast({
        type: 'success',
        title: 'Thành công',
        message: `Đã thêm "${trimmedTitle}" với mã ${trimmedCode}; mã bản sao bắt đầu từ ${trimmedCode}-01.`,
      });

      // Reset form
      setBookTitle('');
      setBookCode('');
      setBookCodeAvailability('idle');
      setBookAuthor('');
      setBookIsbn('');
      setBookYear('');
      setBookLanguage('vi');
      setCustomBookLanguage('');
      setBookTotalCopies(1);
      setBookLocation('');
      setBookDescription('');
      setBookCoverFile(null);
      setBookCoverPreview(null);
      setIsAddBookModalOpen(false);

      // Refresh list
      fetchCategoryBooks();
      fetchCategoryInfo();
    } catch (err: any) {
      console.error('Error creating book:', err);
      showToast({
        type: 'error',
        title: 'Lỗi thêm đầu sách',
        message: err.message || 'Có lỗi xảy ra khi tạo đầu sách.',
      });
    } finally {
      setSavingBook(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="lib-cat-initial-loading" role="status" aria-live="polite">
        <div>
          <span className="lib-cat-initial-spinner" aria-hidden="true" />
          <p>Đang tải...</p>
        </div>
      </div>
    );
  }

  if (categoryError && !category) {
    return (
      <div className="lib-cat-books-error" role="alert">
        <AlertCircle size={32} />
        <p>{categoryError}</p>
        <button type="button" onClick={fetchCategoryInfo} className="retry-btn">Thử lại</button>
      </div>
    );
  }

  return (
    <div className="lib-cat-books-page">
      {/* Top Nav & Breadcrumb */}
      <div className="lib-cat-books-nav">
        <button
          type="button"
          className="lib-cat-books-btn-back"
          onClick={() => navigate('/librarian/books')}
        >
          <ArrowLeft size={16} />
          <span>Tất cả danh mục sách</span>
        </button>

        <div className="lib-cat-books-breadcrumb">
          <span>Thủ thư</span>
          <span>/</span>
          <span>Sách & Biên mục</span>
          <span>/</span>
          <strong>{category?.name || 'Chi tiết danh mục'}</strong>
        </div>
      </div>

      {/* Category Banner Card */}
      <section className="lib-cat-books-banner">
        <div className="lib-cat-books-banner-media">
          {category?.imageUrl ? (
            <img
              src={category.imageUrl}
              alt={category.name}
              className="lib-cat-books-banner-img"
            />
          ) : (
            <div className="lib-cat-books-banner-img-fallback">
              <BookOpen size={48} />
              <span>{category?.name?.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="lib-cat-books-banner-info">
          <div className="lib-cat-books-banner-tag-row">
            <div className="lib-cat-books-banner-tag">
              <Layers size={14} />
              <span>DANH MỤC BIÊN MỤC</span>
            </div>

            {/* Actions: Thêm sách, Chỉnh sửa, Xóa */}
            <div className="lib-cat-banner-action-buttons">
              <button
                type="button"
                className="lib-cat-btn-add-book-banner"
                onClick={() => setIsAddBookModalOpen(true)}
                title="Thêm một đầu sách mới vào danh mục này"
              >
                <Plus size={16} />
                <span>Thêm đầu sách mới</span>
              </button>

              <button
                type="button"
                className="lib-cat-btn-edit-banner"
                onClick={handleRequestEdit}
                title="Chỉnh sửa tên, mô tả hoặc ảnh của danh mục này"
              >
                <Pencil size={15} />
                <span>Chỉnh sửa thông tin</span>
              </button>

              <button
                type="button"
                className="lib-cat-btn-delete-banner"
                onClick={() => setConfirmDeleteOpen(true)}
                title="Xóa danh mục sách này"
              >
                <Trash2 size={15} />
                <span>Xóa danh mục</span>
              </button>
            </div>
          </div>

          <h1>{category?.name || (loadingCategory ? 'Đang tải...' : 'Danh mục sách')}</h1>

          <p className="lib-cat-books-banner-desc">
            {category?.description || 'Các đầu sách chuyên đề và tài liệu được biên mục thuộc danh mục này.'}
          </p>

          <div className="lib-cat-books-banner-stats">
            <div className="lib-cat-books-stat-chip">
              <BookMarked size={16} />
              <span>
                Tổng số đầu sách: <strong>{totalCount} cuốn</strong>
              </span>
            </div>

            {category?.createdAt && (
              <div className="lib-cat-books-stat-chip muted">
                <Calendar size={14} />
                <span>
                  Khởi tạo: {new Date(category.createdAt).toLocaleDateString('vi-VN')}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar: Search books within category */}
      <section className="lib-cat-books-toolbar">
        <div className="lib-cat-books-search">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Tìm kiếm sách theo tiêu đề, tác giả, ISBN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchTerm('')}
            >
              ×
            </button>
          )}
        </div>

        <div className="lib-cat-books-toolbar-meta">
          <span>
            Tìm thấy <strong>{totalCount}</strong> đầu sách
          </span>
          <button
            type="button"
            className="refresh-btn"
            onClick={fetchCategoryBooks}
            title="Tải lại danh sách"
          >
            <RefreshCw size={15} className={loadingBooks ? 'spinning' : ''} />
          </button>
        </div>
      </section>

      {/* Book Grid */}
      {loadingBooks ? (
        <div className="lib-cat-books-loading">
          <div className="spinner" />
          <p>Đang tải danh sách sách thuộc danh mục...</p>
        </div>
      ) : error ? (
        <div className="lib-cat-books-error">
          <AlertCircle size={32} />
          <p>{error}</p>
          <button type="button" onClick={fetchCategoryBooks} className="retry-btn">
            Thử lại
          </button>
        </div>
      ) : books.length === 0 ? (
        <div className="lib-cat-books-empty">
          <BookOpen size={48} />
          <h3>Chưa có đầu sách nào</h3>
          <p>
            {searchTerm
              ? `Không tìm thấy sách nào phù hợp với từ khóa "${searchTerm}".`
              : 'Hiện tại chưa có đầu sách nào được phân loại vào danh mục này. Hãy bắt đầu thêm đầu sách mới!'}
          </p>
          {!searchTerm && (
            <button
              type="button"
              className="lib-cat-btn-add-book-center"
              onClick={() => setIsAddBookModalOpen(true)}
            >
              <Plus size={16} />
              <span>Thêm đầu sách đầu tiên</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6 lg:gap-8">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="lib-cat-books-pagination">
          <button
            type="button"
            className="pagination-btn"
            disabled={currentPage <= 1 || loadingBooks}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            ← Trang trước
          </button>

          <span className="pagination-info">
            Trang <strong>{currentPage}</strong> / {totalPages}
          </span>

          <button
            type="button"
            className="pagination-btn"
            disabled={currentPage >= totalPages || loadingBooks}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Trang tiếp →
          </button>
        </div>
      )}

      {/* ─── Modal 1: Confirmation Before Editing ─── */}
      {confirmEditOpen && (
        <div className="lib-cat-modal-overlay" onClick={() => setConfirmEditOpen(false)}>
          <div className="lib-cat-modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lib-cat-modal-icon-info">
              <HelpCircle size={32} />
            </div>
            <h3>Xác nhận chỉnh sửa danh mục?</h3>
            <p>
              Bạn có đồng ý chỉnh sửa thông tin của danh mục <strong>"{category?.name}"</strong> không?
            </p>
            <div className="lib-cat-modal-actions">
              <button
                type="button"
                className="lib-cat-modal-btn-cancel"
                onClick={() => setConfirmEditOpen(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="lib-cat-modal-btn-confirm-edit"
                onClick={handleProceedToEdit}
              >
                Đồng ý chỉnh sửa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Confirmation Before Deleting ─── */}
      {confirmDeleteOpen && (
        <div className="lib-cat-modal-overlay" onClick={() => setConfirmDeleteOpen(false)}>
          <div className="lib-cat-modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lib-cat-modal-icon-danger">
              <AlertCircle size={32} />
            </div>
            <h3>Xác nhận xóa danh mục sách?</h3>
            <p>
              Bạn có chắc chắn muốn xóa danh mục <strong>"{category?.name}"</strong>?
              {totalCount > 0 && (
                <span className="lib-cat-modal-warning-highlight">
                  <br />
                  ⚠️ Danh mục này hiện đang có <strong>{totalCount}</strong> đầu sách liên kết!
                </span>
              )}
            </p>
            <div className="lib-cat-modal-actions">
              <button
                type="button"
                className="lib-cat-modal-btn-cancel"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deletingCategory}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="lib-cat-modal-btn-confirm-delete"
                onClick={handleDeleteCategory}
                disabled={deletingCategory}
              >
                {deletingCategory ? 'Đang xóa...' : 'Đồng ý xóa danh mục'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 3: Edit Category Form Modal ─── */}
      {isEditModalOpen && (
        <div className="lib-cat-modal-overlay" onClick={handleCloseEdit}>
          <div className="lib-cat-modal-content edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lib-cat-modal-header">
              <div className="lib-cat-modal-title-row">
                <div className="lib-cat-modal-badge">
                  <Pencil size={14} />
                  <span>CHỈNH SỬA BIÊN MỤC</span>
                </div>
                <button type="button" className="lib-cat-modal-close" onClick={handleCloseEdit}>
                  <X size={18} />
                </button>
              </div>
              <h3>Chỉnh sửa thông tin danh mục</h3>
              <p className="lib-cat-modal-subtitle">
                Cập nhật tên danh mục, mô tả hoặc thay đổi hình ảnh đại diện được lưu trữ trên Cloudinary.
              </p>
            </div>

            <form onSubmit={handleSaveEdit} className="lib-cat-edit-form">
              <div className="lib-cat-form-group">
                <label htmlFor="cat-edit-name">
                  Tên danh mục sách <span className="req">*</span>
                </label>
                <input
                  id="cat-edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ví dụ: Công nghệ thông tin, Ngoại ngữ..."
                  required
                />
              </div>

              <div className="lib-cat-form-group">
                <label htmlFor="cat-edit-desc">Mô tả danh mục</label>
                <textarea
                  id="cat-edit-desc"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Mô tả tóm tắt về các thể loại sách trong danh mục..."
                />
              </div>

              <div className="lib-cat-form-group">
                <label>Hình ảnh danh mục</label>
                <div className="lib-cat-edit-image-row">
                  {editImagePreview ? (
                    <div className="lib-cat-edit-preview-box">
                      <img src={editImagePreview} alt="Preview" className="lib-cat-edit-preview-img" />
                      <button
                        type="button"
                        className="lib-cat-edit-remove-img"
                        onClick={() => {
                          setEditImagePreview(null);
                          setEditImageFile(null);
                          setEditRemoveImage(true);
                        }}
                        title="Xóa hình ảnh này"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="lib-cat-edit-no-image">
                      <ImageIcon size={28} />
                      <span>Chưa có ảnh</span>
                    </div>
                  )}

                  <div className="lib-cat-edit-upload-box">
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleEditFileChange(e.target.files[0]);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="lib-cat-btn-choose-file"
                      onClick={() => editFileInputRef.current?.click()}
                    >
                      <UploadCloud size={16} />
                      <span>{editImagePreview ? 'Thay đổi hình ảnh' : 'Tải ảnh từ máy tính'}</span>
                    </button>
                    <span className="lib-cat-edit-file-hint">JPG, PNG, WEBP (Tối đa 10MB)</span>
                  </div>
                </div>
              </div>

              <div className="lib-cat-modal-actions">
                <button
                  type="button"
                  className="lib-cat-modal-btn-cancel"
                  onClick={handleCloseEdit}
                  disabled={savingEdit}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="lib-cat-modal-btn-save"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 4: Add New Book Modal ─── */}
      {isAddBookModalOpen && (
        <div className="lib-cat-modal-overlay" onClick={() => setIsAddBookModalOpen(false)}>
          <div className="lib-cat-modal-content add-book-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lib-cat-modal-header">
              <div className="lib-cat-modal-title-row">
                <div className="lib-cat-modal-badge orange">
                  <Plus size={14} />
                  <span>THÊM ĐẦU SÁCH MỚI</span>
                </div>
                <button type="button" className="lib-cat-modal-close" onClick={() => setIsAddBookModalOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <h3>Thêm đầu sách vào danh mục "{category?.name}"</h3>
              <p className="lib-cat-modal-subtitle">
                Nhập thông tin chi tiết và tải ảnh bìa cuốn sách lên hệ thống Cloudinary thư viện.
              </p>
            </div>

            <form onSubmit={handleCreateBook} className="lib-cat-book-form">
              <div className="lib-cat-form-grid-2">
                <div className="lib-cat-form-group col-span-2">
                  <label htmlFor="book-title">
                    <FileText size={14} />
                    <span>Tiêu đề sách</span>
                    <span className="req">*</span>
                  </label>
                  <input
                    id="book-title"
                    type="text"
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                    placeholder="Ví dụ: Lập trình C# căn bản, Clean Code..."
                    required
                  />
                </div>

                <div className="lib-cat-form-group">
                  <label htmlFor="book-code">
                    <Barcode size={14} />
                    <span>Mã sách</span>
                    <span className="req">*</span>
                  </label>
                  <input
                    id="book-code"
                    type="text"
                    value={bookCode}
                    onChange={(event) => {
                      const value = event.target.value;
                      const normalized = value.trim();
                      setBookCode(value);
                      setBookCodeAvailability(
                        !normalized
                          ? 'idle'
                          : BOOK_CODE_PATTERN.test(normalized)
                            ? 'checking'
                            : 'invalid',
                      );
                    }}
                    maxLength={32}
                    pattern="[A-Za-z0-9]{1,32}"
                    placeholder="Ví dụ: py01"
                    aria-describedby="book-code-hint"
                    required
                  />
                  <small
                    id="book-code-hint"
                    className={`lib-cat-book-code-status is-${bookCodeAvailability}`}
                    role={bookCodeAvailability === 'taken' || bookCodeAvailability === 'error' ? 'alert' : 'status'}
                  >
                    {bookCodeAvailability === 'checking' && 'Đang kiểm tra mã sách...'}
                    {bookCodeAvailability === 'available' && 'Mã sách chưa được sử dụng.'}
                    {bookCodeAvailability === 'taken' && 'Mã này đã tồn tại. Hãy nhập mã khác.'}
                    {bookCodeAvailability === 'invalid' && 'Chỉ dùng chữ cái và chữ số, tối đa 32 ký tự.'}
                    {bookCodeAvailability === 'error' && 'Không kiểm tra được mã. Vui lòng thử lại.'}
                    {bookCodeAvailability === 'idle' && 'Mã bản sao sẽ theo dạng mã sách-01, mã sách-02...'}
                  </small>
                </div>

                <div className="lib-cat-form-group">
                  <label htmlFor="book-author">
                    <User size={14} />
                    <span>Tác giả</span>
                  </label>
                  <input
                    id="book-author"
                    type="text"
                    value={bookAuthor}
                    onChange={(e) => setBookAuthor(e.target.value)}
                    placeholder="Ví dụ: Robert C. Martin, Nguyễn Nhật Ánh..."
                  />
                </div>

                <div className="lib-cat-form-group">
                  <label htmlFor="book-isbn">
                    <Barcode size={14} />
                    <span>Mã ISBN</span>
                  </label>
                  <input
                    id="book-isbn"
                    type="text"
                    value={bookIsbn}
                    onChange={(e) => setBookIsbn(e.target.value)}
                    placeholder="Ví dụ: 978-0132350884..."
                  />
                </div>

                <div className="lib-cat-form-group">
                  <label htmlFor="book-year">
                    <Calendar size={14} />
                    <span>Năm xuất bản</span>
                  </label>
                  <input
                    id="book-year"
                    type="number"
                    min="1900"
                    max={new Date().getFullYear() + 1}
                    value={bookYear}
                    onChange={(e) => setBookYear(e.target.value)}
                    placeholder={`Ví dụ: ${new Date().getFullYear()}`}
                  />
                </div>

                <div className="lib-cat-form-group">
                  <label htmlFor="book-copies">
                    <Copy size={14} />
                    <span>Số lượng cuốn bản sao</span>
                  </label>
                  <input
                    id="book-copies"
                    type="number"
                    min="1"
                    max="500"
                    value={bookTotalCopies}
                    onChange={(e) => setBookTotalCopies(parseInt(e.target.value, 10) || 1)}
                  />
                  <small>Hệ thống tự tạo mã riêng cho từng cuốn.</small>
                </div>

                <div className="lib-cat-form-group">
                  <label htmlFor="book-lang">
                    <Globe size={14} />
                    <span>Ngôn ngữ</span>
                  </label>
                  <select
                    id="book-lang"
                    value={bookLanguage}
                    onChange={(e) => setBookLanguage(e.target.value)}
                  >
                    <option value="vi">Tiếng Việt (vi)</option>
                    <option value="en">Tiếng Anh (en)</option>
                    <option value="ja">Tiếng Nhật (ja)</option>
                    <option value="ko">Tiếng Hàn (ko)</option>
                    <option value="custom">Thêm ngôn ngữ mới...</option>
                  </select>
                </div>

                {bookLanguage === 'custom' && (
                  <div className="lib-cat-form-group">
                    <label htmlFor="book-custom-language">
                      <Globe size={14} />
                      <span>Ngôn ngữ mới</span>
                      <span className="req">*</span>
                    </label>
                    <input
                      id="book-custom-language"
                      type="text"
                      maxLength={50}
                      value={customBookLanguage}
                      onChange={(e) => setCustomBookLanguage(e.target.value)}
                      placeholder="Nhập tên hoặc mã ngôn ngữ"
                      required
                    />
                  </div>
                )}

                <div className="lib-cat-form-group">
                  <label htmlFor="book-location">
                    <MapPin size={14} />
                    <span>Vị trí kệ sách</span>
                  </label>
                  <select
                    id="book-location"
                    value={bookLocation}
                    onChange={(e) => setBookLocation(e.target.value)}
                  >
                    <option value="">Chưa xếp kệ</option>
                    {STORAGE_LOCATIONS.map((location) => (
                      <option value={location} key={location}>{location}</option>
                    ))}
                  </select>
                </div>

                <div className="lib-cat-form-group col-span-2">
                  <label htmlFor="book-desc">Mô tả tóm tắt nội dung</label>
                  <textarea
                    id="book-desc"
                    rows={3}
                    value={bookDescription}
                    onChange={(e) => setBookDescription(e.target.value)}
                    placeholder="Mô tả nội dung cuốn sách, mục lục tóm lược hoặc ghi chú..."
                  />
                </div>

                {/* Cover Image Upload */}
                <div className="lib-cat-form-group col-span-2">
                  <label>Ảnh bìa sách (Tải lên Cloudinary)</label>
                  <div className="lib-cat-book-cover-row">
                    {bookCoverPreview ? (
                      <div className="lib-cat-book-cover-preview">
                        <img src={bookCoverPreview} alt="Cover Preview" />
                        <button
                          type="button"
                          className="lib-cat-remove-cover-btn"
                          onClick={() => {
                            setBookCoverFile(null);
                            setBookCoverPreview(null);
                          }}
                          title="Hủy ảnh này"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="lib-cat-book-cover-placeholder"
                        onClick={() => bookCoverInputRef.current?.click()}
                      >
                        <ImageIcon size={32} />
                        <span>Chưa có ảnh bìa</span>
                      </div>
                    )}

                    <div className="lib-cat-book-cover-picker">
                      <input
                        ref={bookCoverInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleBookCoverChange(e.target.files[0]);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="lib-cat-btn-choose-file"
                        onClick={() => bookCoverInputRef.current?.click()}
                      >
                        <UploadCloud size={16} />
                        <span>{bookCoverPreview ? 'Đổi ảnh bìa khác' : 'Chọn ảnh bìa từ máy tính'}</span>
                      </button>
                      <span className="lib-cat-edit-file-hint">JPG, PNG, WEBP (Tối đa 10MB)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lib-cat-modal-actions">
                <button
                  type="button"
                  className="lib-cat-modal-btn-cancel"
                  onClick={() => setIsAddBookModalOpen(false)}
                  disabled={savingBook || bookCodeAvailability !== 'available'}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="lib-cat-modal-btn-save"
                  disabled={savingBook}
                >
                  {savingBook ? 'Đang thêm đầu sách...' : 'Thêm đầu sách'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibrarianCategoryBooksPage;
