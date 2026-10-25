import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Pencil,
  Trash2,
  Calendar,
  Globe,
  Star,
  FileText,
  UploadCloud,
  X,
  AlertCircle,
  Layers,
  User,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { parseApiResponse } from '../../../lib/api';
import { STORAGE_LOCATIONS } from '../storageLocations';
import type { CategoryItem } from './LibrarianCategoriesPage';
import './LibrarianBookDetailPage.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5278';

export interface BookDetailData {
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
  updatedAt: string;
}

interface BookCopyItem {
  id: string;
  barcode: string;
  condition: 'New' | 'Good' | 'Fair' | 'Damaged' | 'Lost';
  location: string | null;
  isAvailable: boolean;
  hasOverdueLoan: boolean;
  hasActiveLoan: boolean;
  hasApprovedLoan: boolean;
}

interface BookCopiesResponse {
  success?: boolean;
  data?: BookCopyItem[];
  error?: string;
  meta?: {
    totalPages?: number;
  };
}

const COPY_PAGE_SIZE = 20;

const getCopyStatus = (copy: BookCopyItem) => {
  if (copy.condition === 'Lost') return { label: 'Thất lạc', className: 'is-lost' };
  if (copy.condition === 'Damaged') return { label: 'Hư hỏng', className: 'is-damaged' };
  if (copy.hasOverdueLoan) return { label: 'Quá hạn', className: 'is-overdue' };
  if (copy.hasActiveLoan) return { label: 'Đang mượn', className: 'is-borrowed' };
  if (copy.hasApprovedLoan) return { label: 'Đã duyệt mượn', className: 'is-reserved' };
  if (copy.isAvailable) return { label: 'Sẵn sàng', className: 'is-available' };
  return { label: 'Không khả dụng', className: 'is-unavailable' };
};

const LibrarianBookDetailPage: React.FC = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { showToast } = useToast();

  const [book, setBook] = useState<BookDetailData | null>(null);
  const [copies, setCopies] = useState<BookCopyItem[]>([]);
  const [copiesLoading, setCopiesLoading] = useState(true);
  const [copiesError, setCopiesError] = useState<string | null>(null);
  const [copiesPage, setCopiesPage] = useState(1);
  const [copiesPageCount, setCopiesPageCount] = useState(1);
  const [copiesRefreshKey, setCopiesRefreshKey] = useState(0);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Confirmation before edit & before delete
  const [confirmEditOpen, setConfirmEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit Book Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editIsbn, setEditIsbn] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editLanguage, setEditLanguage] = useState('vi');
  const [editCustomLanguage, setEditCustomLanguage] = useState('');
  const [editTotalCopies, setEditTotalCopies] = useState(1);
  const [editLocation, setEditLocation] = useState('');
  const [editLocationOriginal, setEditLocationOriginal] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [editRemoveCover, setEditRemoveCover] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Book Details
  const fetchBookDetails = useCallback(async () => {
    if (!bookId) return;
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/books/${bookId}`, { headers });
      const json = await parseApiResponse<{ success?: boolean; data?: BookDetailData; error?: string }>(res);

      if (json && json.data) {
        setBook(json.data);
        setError(null);
      } else {
        throw new Error('Không tìm thấy thông tin đầu sách.');
      }
    } catch (err: unknown) {
      console.error('Error fetching book details:', err);
      setError(err instanceof Error ? err.message : 'Không thể tải thông tin đầu sách.');
      showToast({
        type: 'error',
        title: 'Lỗi tải sách',
        message: 'Không thể kết nối đến máy chủ để lấy thông tin chi tiết đầu sách.',
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken, bookId, showToast]);

  // Fetch Categories for Edit Modal selection
  const fetchCategories = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(`${API_BASE_URL}/api/v1/categories`, { headers });
      const json = await parseApiResponse<{ success?: boolean; data?: CategoryItem[] }>(res);
      if (json && json.data) {
        setCategories(json.data);
      }
    } catch (err) {
      console.error('Error fetching categories for dropdown:', err);
    }
  }, [accessToken]);

  useEffect(() => {
    void Promise.resolve().then(fetchBookDetails);
    void Promise.resolve().then(fetchCategories);
  }, [fetchBookDetails, fetchCategories]);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;

    const loadCopies = async () => {
      setCopiesLoading(true);
      setCopiesError(null);
      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const params = new URLSearchParams({
          bookId,
          page: String(copiesPage),
          pageSize: String(COPY_PAGE_SIZE),
        });
        const response = await fetch(`${API_BASE_URL}/api/v1/copies?${params}`, { headers });
        const result = await parseApiResponse<BookCopiesResponse>(response);
        if (!response.ok || !result?.success) {
          throw new Error(result?.error || 'Không thể tải danh sách bản sao của đầu sách.');
        }
        if (!cancelled) {
          setCopies(result.data ?? []);
          setCopiesPageCount(Math.max(1, result.meta?.totalPages ?? 1));
        }
      } catch (caught) {
        if (!cancelled) {
          setCopiesError(caught instanceof Error ? caught.message : 'Không thể tải danh sách bản sao.');
        }
      } finally {
        if (!cancelled) setCopiesLoading(false);
      }
    };

    void loadCopies();
    return () => { cancelled = true; };
  }, [accessToken, bookId, copiesPage, copiesRefreshKey]);

  // Handle Opening Edit Modal (after confirmation)
  const handleOpenEditModal = () => {
    if (!book) return;
    setConfirmEditOpen(false);
    setEditTitle(book.title || '');
    setEditAuthor(book.authorNames && book.authorNames.length > 0 ? book.authorNames[0] : '');
    setEditIsbn(book.isbn || '');
    setEditYear(book.publishedYear ? String(book.publishedYear) : '');
    const knownLanguages = ['vi', 'en', 'ja', 'ko', 'fr'];
    setEditLanguage(book.language && knownLanguages.includes(book.language) ? book.language : 'custom');
    setEditCustomLanguage(book.language && !knownLanguages.includes(book.language) ? book.language : '');
    setEditTotalCopies(book.totalCopies);
    const currentLocation = copies.find((copy) => copy.location)?.location ?? '';
    setEditLocation(currentLocation);
    setEditLocationOriginal(currentLocation);
    setEditDescription(book.description || '');
    setEditCoverFile(null);
    setEditCoverPreview(book.coverImageUrl || null);
    setEditRemoveCover(false);

    // Find category ID matching name if possible
    if (book.categoryNames && book.categoryNames.length > 0) {
      const matchedCat = categories.find((c) => c.name === book.categoryNames[0]);
      if (matchedCat) setEditCategoryId(matchedCat.id);
    }

    setIsEditModalOpen(true);
  };

  // Handle Edit File Select
  const handleFileChange = (file: File | null) => {
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

    setEditCoverFile(file);
    setEditRemoveCover(false);
    setEditCoverPreview(URL.createObjectURL(file));
  };

  // Submit Save Edit Book
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookId) return;

    const trimmed = editTitle.trim();
    if (!trimmed) {
      showToast({
        type: 'warning',
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập tên đầu sách.',
      });
      return;
    }

    setSavingEdit(true);
    try {
      const formData = new FormData();
      formData.append('Title', trimmed);
      if (editAuthor.trim()) formData.append('AuthorName', editAuthor.trim());
      if (editIsbn.trim()) formData.append('Isbn', editIsbn.trim());
      if (editYear) formData.append('PublishedYear', editYear);
      const language = editLanguage === 'custom' ? editCustomLanguage.trim() : editLanguage || 'vi';
      if (!language) {
        throw new Error('Vui lòng nhập ngôn ngữ của sách.');
      }
      formData.append('Language', language);
      formData.append('TotalCopies', String(editTotalCopies));
      if (editLocation !== editLocationOriginal) {
        formData.append('Location', editLocation);
      }
      if (editCategoryId) formData.append('CategoryId', editCategoryId);
      if (editDescription.trim()) formData.append('Description', editDescription.trim());
      if (editCoverFile) formData.append('CoverImage', editCoverFile);
      if (editRemoveCover) formData.append('RemoveCoverImage', 'true');

      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/books/${bookId}/form`, {
        method: 'PUT',
        headers,
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || json?.message || 'Không thể cập nhật đầu sách.');
      }

      showToast({
        type: 'success',
        title: 'Cập nhật thành công',
        message: `Đã cập nhật thông tin đầu sách "${trimmed}" thành công!`,
      });

      setIsEditModalOpen(false);
      fetchBookDetails();
      setCopiesPage(1);
      setCopiesRefreshKey((current) => current + 1);
      if (editLocation !== editLocationOriginal) {
        setCopies((currentCopies) => currentCopies.map((copy) => ({
          ...copy,
          location: editLocation.trim() || null,
        })));
        setEditLocationOriginal(editLocation);
      }
    } catch (err: unknown) {
      console.error('Error updating book:', err);
      showToast({
        type: 'error',
        title: 'Cập nhật thất bại',
        message: err instanceof Error ? err.message : 'Có lỗi xảy ra khi cập nhật đầu sách.',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  // Submit Delete Book
  const handleDeleteBook = async () => {
    if (!bookId || !book) return;
    setDeleting(true);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/books/${bookId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Không thể xóa đầu sách.');
      }

      showToast({
        type: 'success',
        title: 'Đã xóa đầu sách',
        message: `Đầu sách "${book.title}" đã được xóa khỏi hệ thống.`,
      });

      setConfirmDeleteOpen(false);
      // Navigate back to the previous screen or categories
      navigate(-1);
    } catch (err: unknown) {
      console.error('Error deleting book:', err);
      showToast({
        type: 'error',
        title: 'Xóa thất bại',
        message: err instanceof Error ? err.message : 'Có lỗi xảy ra khi xóa đầu sách.',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="lib-book-detail-page">
        <div className="lib-book-loading">
          <div className="lib-book-spinner" />
          <p>Đang tải thông tin chi tiết đầu sách...</p>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="lib-book-detail-page">
        <div className="lib-book-error">
          <AlertCircle size={36} color="#ef4444" />
          <h3>Không tìm thấy đầu sách</h3>
          <p>{error || 'Đầu sách không tồn tại hoặc đã bị xóa.'}</p>
          <button type="button" className="lib-book-btn-back" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
            <span>Quay lại</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="lib-book-detail-page">
      {/* ─── Navigation & Breadcrumbs ─── */}
      <div className="lib-book-detail-nav">
        <button type="button" className="lib-book-btn-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          <span>Quay lại</span>
        </button>

        <div className="lib-book-breadcrumb">
          <span>Thủ thư</span>
          <span>/</span>
          <span>Quản lý sách</span>
          <span>/</span>
          <span className="active" title={book.title}>
            {book.title}
          </span>
        </div>
      </div>

      {/* ─── Hero Book Card ─── */}
      <section className="lib-book-hero-card">
        {/* Left: Book Cover */}
        <div className="lib-book-cover-container">
          <div className="lib-book-cover-box">
            {book.coverImageUrl ? (
              <img src={book.coverImageUrl} alt={book.title} />
            ) : (
              <div className="lib-book-cover-fallback">
                <BookOpen size={48} />
                <span>Chưa có ảnh bìa</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Book Details & Action Buttons */}
        <div className="lib-book-hero-content">
          <div className="lib-book-hero-top">
            <div>
              <div className="lib-book-hero-eyebrow">
                <BookOpen size={14} />
                <span>ĐẦU SÁCH BIÊN MỤC • SMARTLIBRARY</span>
              </div>
              <h1 className="lib-book-hero-title">{book.title}</h1>
              <div className="lib-book-hero-author">
                <User size={15} color="#64748b" />
                <span>
                  Tác giả:{' '}
                  <strong>
                    {book.authorNames && book.authorNames.length > 0
                      ? book.authorNames.join(', ')
                      : 'Chưa rõ tác giả'}
                  </strong>
                </span>
              </div>
            </div>

            {/* Action Buttons: Chỉnh sửa & Xóa */}
            <div className="lib-book-actions-group">
              <button
                type="button"
                className="lib-book-btn-edit"
                onClick={() => setConfirmEditOpen(true)}
                title="Chỉnh sửa thông tin và ảnh bìa đầu sách"
              >
                <Pencil size={15} />
                <span>Chỉnh sửa thông tin đầu sách</span>
              </button>

              <button
                type="button"
                className="lib-book-btn-delete"
                onClick={() => setConfirmDeleteOpen(true)}
                title="Xóa đầu sách này"
              >
                <Trash2 size={15} />
                <span>Xóa đầu sách</span>
              </button>
            </div>
          </div>

          {/* Badges: Categories & Stock Status */}
          <div className="lib-book-badges-row">
            {book.categoryNames && book.categoryNames.length > 0 ? (
              book.categoryNames.map((catName) => (
                <span key={catName} className="lib-book-category-chip">
                  <Layers size={13} color="#ea580c" />
                  <span>{catName}</span>
                </span>
              ))
            ) : (
              <span className="lib-book-category-chip">Chung</span>
            )}

            <span
              className={`lib-book-availability-chip ${
                book.availableCopies > 0 ? 'available' : 'out-of-stock'
              }`}
            >
              <Clock size={13} />
              <span>
                {book.availableCopies > 0
                  ? `${book.availableCopies} / ${book.totalCopies} cuốn sẵn sàng cho mượn`
                  : 'Hiện đang mượn hết'}
              </span>
            </span>
          </div>

          {/* Metadata Grid */}
          <div className="lib-book-meta-grid">
            <div className="lib-book-meta-card">
              <span className="lib-book-meta-label">Mã sách</span>
              <span className="lib-book-meta-value">{book.code}</span>
            </div>

            <div className="lib-book-meta-card">
              <span className="lib-book-meta-label">Mã ISBN</span>
              <span className="lib-book-meta-value">
                {book.isbn || <span style={{ color: '#94a3b8' }}>Chưa cập nhật</span>}
              </span>
            </div>

            <div className="lib-book-meta-card">
              <span className="lib-book-meta-label">Năm xuất bản</span>
              <span className="lib-book-meta-value">
                {book.publishedYear ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={13} color="#ea580c" />
                    {book.publishedYear}
                  </span>
                ) : (
                  '---'
                )}
              </span>
            </div>

            <div className="lib-book-meta-card">
              <span className="lib-book-meta-label">Ngôn ngữ</span>
              <span className="lib-book-meta-value">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Globe size={13} color="#0284c7" />
                  {book.language ? book.language.toUpperCase() : 'VI'}
                </span>
              </span>
            </div>

            <div className="lib-book-meta-card">
              <span className="lib-book-meta-label">Tổng bản sao</span>
              <span className="lib-book-meta-value">{book.totalCopies} cuốn</span>
            </div>

            <div className="lib-book-meta-card">
              <span className="lib-book-meta-label">Đánh giá</span>
              <span className="lib-book-meta-value">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#f59e0b' }}>
                  <Star size={13} fill="#f59e0b" />
                  {book.averageRating > 0 ? book.averageRating.toFixed(1) : '5.0'}
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Description Panel ─── */}
      <section className="lib-book-desc-panel">
        <h2 className="lib-book-section-title">
          <FileText size={18} color="#ea580c" />
          <span>Tóm tắt & Mô tả nội dung sách</span>
        </h2>
        {book.description ? (
          <div className="lib-book-desc-content">{book.description}</div>
        ) : (
          <div className="lib-book-desc-empty">Chưa có thông tin mô tả chi tiết cho đầu sách này.</div>
        )}
      </section>

      <section className="lib-book-copies-panel">
        <div className="lib-book-copies-heading">
          <div>
            <h2 className="lib-book-section-title">
              <MapPin size={18} color="#ea580c" />
              <span>Danh sách bản sao & vị trí kệ</span>
            </h2>
            <p>Thông tin từng cuốn được tạo từ đầu sách này.</p>
          </div>
          <span>{book.totalCopies} bản sao</span>
        </div>
        {copiesError ? (
          <div className="lib-book-copies-message is-error" role="alert">{copiesError}</div>
        ) : copiesLoading ? (
          <div className="lib-book-copies-message" role="status">Đang tải danh sách bản sao...</div>
        ) : copies.length === 0 ? (
          <div className="lib-book-copies-message">Đầu sách này chưa có bản sao.</div>
        ) : (
          <>
            <div className="lib-book-copies-table-wrap">
              <table className="lib-book-copies-table">
                <thead>
                  <tr><th>ID bản sao sách</th><th>Trạng thái</th><th>Vị trí kệ</th></tr>
                </thead>
                <tbody>
                  {copies.map((copy) => {
                    const status = getCopyStatus(copy);
                    return (
                      <tr key={copy.id}>
                        <td><code>{copy.barcode}</code></td>
                        <td><span className={`lib-book-copy-status ${status.className}`}>{status.label}</span></td>
                        <td>{copy.location || <span className="lib-book-copy-unassigned">Chưa xếp kệ</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {copiesPageCount > 1 && (
              <div className="lib-book-copies-pagination">
                <span>Trang {copiesPage} / {copiesPageCount}</span>
                <div>
                  <button
                    type="button"
                    aria-label="Trang trước"
                    disabled={copiesPage <= 1 || copiesLoading}
                    onClick={() => setCopiesPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    type="button"
                    aria-label="Trang sau"
                    disabled={copiesPage >= copiesPageCount || copiesLoading}
                    onClick={() => setCopiesPage((current) => Math.min(copiesPageCount, current + 1))}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ─── Modal 1: Confirmation Before Editing ─── */}
      {confirmEditOpen && (
        <div className="lib-cat-modal-overlay" onClick={() => setConfirmEditOpen(false)}>
          <div className="lib-cat-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="lib-cat-modal-icon-info">
              <Pencil size={26} />
            </div>
            <h3>Xác nhận chỉnh sửa đầu sách?</h3>
            <p>
              Bạn có chắc chắn muốn mở trình chỉnh sửa để thay đổi thông tin hoặc cập nhật ảnh bìa của
              đầu sách <strong>"{book.title}"</strong>?
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
                className="lib-cat-modal-btn-proceed"
                onClick={handleOpenEditModal}
              >
                Đồng ý chỉnh sửa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Edit Book Modal ─── */}
      {isEditModalOpen && (
        <div className="lib-cat-modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div
            className="lib-cat-modal-content edit-book-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lib-cat-modal-header">
              <div className="lib-cat-modal-title-row">
                <div className="lib-cat-modal-badge">
                  <Pencil size={14} />
                  <span>CẬP NHẬT ĐẦU SÁCH</span>
                </div>
                <button
                  type="button"
                  className="lib-cat-modal-close"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <h3>Chỉnh sửa thông tin đầu sách</h3>
              <p style={{ textAlign: 'left', marginTop: 4 }}>
                Thay đổi tiêu đề, tác giả, mô tả hoặc cập nhật ảnh bìa lưu trữ trên Cloudinary.
              </p>
            </div>

            <form onSubmit={handleSaveEdit} className="lib-cat-edit-form">
              <div className="lib-cat-form-group">
                <label>
                  Tên đầu sách <span className="req">*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Ví dụ: Python cơ bản..."
                  required
                />
              </div>

              <div className="lib-cat-form-group">
                <label>Mã sách</label>
                <input type="text" value={book?.code ?? ''} readOnly />
                <small>Mã sách giữ cố định để không làm thay đổi mã bản sao đã cấp.</small>
              </div>

              <div className="lib-form-grid-2">
                <div className="lib-cat-form-group">
                  <label>Tác giả</label>
                  <input
                    type="text"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    placeholder="Ví dụ: Bùi Việt Hà..."
                  />
                </div>

                <div className="lib-cat-form-group">
                  <label>Mã ISBN</label>
                  <input
                    type="text"
                    value={editIsbn}
                    onChange={(e) => setEditIsbn(e.target.value)}
                    placeholder="Ví dụ: 978-604-0-12345-6..."
                  />
                </div>
              </div>

              <div className="lib-form-grid-2">
                <div className="lib-cat-form-group">
                  <label>Năm xuất bản</label>
                  <input
                    type="number"
                    min="1800"
                    max="2100"
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    placeholder="Ví dụ: 2026..."
                  />
                </div>

                <div className="lib-cat-form-group">
                  <label>Ngôn ngữ</label>
                  <select
                    value={editLanguage}
                    onChange={(e) => setEditLanguage(e.target.value)}
                  >
                    <option value="vi">Tiếng Việt (VI)</option>
                    <option value="en">Tiếng Anh (EN)</option>
                    <option value="ja">Tiếng Nhật (JA)</option>
                    <option value="ko">Tiếng Hàn (KO)</option>
                    <option value="fr">Tiếng Pháp (FR)</option>
                    <option value="custom">Thêm ngôn ngữ mới...</option>
                  </select>
                </div>
              </div>

              {editLanguage === 'custom' && (
                <div className="lib-cat-form-group">
                  <label>Ngôn ngữ mới</label>
                  <input
                    type="text"
                    value={editCustomLanguage}
                    onChange={(e) => setEditCustomLanguage(e.target.value)}
                    placeholder="Nhập tên ngôn ngữ"
                    required
                  />
                </div>
              )}

              <div className="lib-cat-form-group">
                <label htmlFor="book-edit-total-copies">Số lượng cuốn bản sao</label>
                <input
                  id="book-edit-total-copies"
                  type="number"
                  min="1"
                  max="500"
                  value={editTotalCopies}
                  onChange={(e) => setEditTotalCopies(Number(e.target.value))}
                  required
                />
                <small>
                  Tăng số lượng sẽ tạo mã bản sao mới. Chỉ có thể giảm số lượng bằng các bản sao đang sẵn sàng thu hồi.
                </small>
              </div>

              <div className="lib-cat-form-group">
                <label>Danh mục sách</label>
                <select
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                >
                  <option value="">-- Giữ nguyên danh mục hiện tại --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lib-cat-form-group">
                <label htmlFor="book-edit-location">Vị trí kệ sách</label>
                <select
                  id="book-edit-location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                >
                  <option value="">Chưa xếp kệ</option>
                  {editLocation && !STORAGE_LOCATIONS.includes(editLocation) && (
                    <option value={editLocation}>{editLocation} (vị trí hiện tại)</option>
                  )}
                  {STORAGE_LOCATIONS.map((location) => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
                <small>Thay đổi vị trí tại đây sẽ áp dụng cho tất cả bản sao của đầu sách.</small>
              </div>

              <div className="lib-cat-form-group">
                <label>Mô tả nội dung cuốn sách</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Giới thiệu tóm tắt nội dung chính của cuốn sách..."
                />
              </div>

              {/* Cover Image Upload */}
              <div className="lib-cat-form-group">
                <label>Ảnh bìa sách</label>
                <div className="lib-cat-edit-image-row">
                  {editCoverPreview ? (
                    <div className="lib-cat-edit-preview-box">
                      <img src={editCoverPreview} alt="Preview" />
                      <button
                        type="button"
                        className="lib-cat-edit-remove-img"
                        onClick={() => {
                          setEditCoverPreview(null);
                          setEditCoverFile(null);
                          setEditRemoveCover(true);
                        }}
                        title="Xóa ảnh bìa này"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="lib-cat-edit-no-image">
                      <BookOpen size={24} />
                      <span>Chưa có ảnh bìa</span>
                    </div>
                  )}

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleFileChange(e.target.files[0]);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="lib-book-btn-edit"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud size={16} />
                      <span>{editCoverPreview ? 'Thay đổi ảnh bìa' : 'Tải ảnh bìa mới'}</span>
                    </button>
                    <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '6px 0 0 0' }}>
                      Định dạng JPG, PNG, WEBP (Tối đa 10MB)
                    </p>
                  </div>
                </div>
              </div>

              <div className="lib-cat-modal-actions">
                <button
                  type="button"
                  className="lib-cat-modal-btn-cancel"
                  onClick={() => setIsEditModalOpen(false)}
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

      {/* ─── Modal 3: Confirmation Before Deleting ─── */}
      {confirmDeleteOpen && (
        <div className="lib-cat-modal-overlay" onClick={() => setConfirmDeleteOpen(false)}>
          <div className="lib-cat-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="lib-cat-modal-icon-danger">
              <Trash2 size={26} />
            </div>
            <h3>Xác nhận xóa đầu sách?</h3>
            <p>
              Bạn có chắc chắn muốn xóa đầu sách <strong>"{book.title}"</strong>?
              <br />
              <span style={{ color: '#dc2626', fontWeight: 600 }}>
                ⚠️ Thao tác này sẽ đánh dấu xóa đầu sách và toàn bộ các bản sao lưu trong kho!
              </span>
            </p>
            <div className="lib-cat-modal-actions">
              <button
                type="button"
                className="lib-cat-modal-btn-cancel"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deleting}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="lib-cat-modal-btn-confirm"
                onClick={handleDeleteBook}
                disabled={deleting}
              >
                {deleting ? 'Đang xóa...' : 'Xác nhận xóa đầu sách'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibrarianBookDetailPage;
