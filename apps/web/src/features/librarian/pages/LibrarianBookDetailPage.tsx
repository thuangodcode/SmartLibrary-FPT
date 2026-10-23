import React, { useEffect, useState, useRef } from 'react';
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
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { parseApiResponse } from '../../../lib/api';
import type { CategoryItem } from './LibrarianCategoriesPage';
import './LibrarianBookDetailPage.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5278';

export interface BookDetailData {
  id: string;
  title: string;
  isbn?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  publishedYear?: number | null;
  language?: string;
  pageCount?: number | null;
  totalCopies: number;
  availableCopies: number;
  averageRating: number;
  authorNames: string[];
  categoryNames: string[];
  createdAt: string;
  updatedAt: string;
}

const LibrarianBookDetailPage: React.FC = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { showToast } = useToast();

  const [book, setBook] = useState<BookDetailData | null>(null);
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
  const [editPageCount, setEditPageCount] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [editRemoveCover, setEditRemoveCover] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Book Details
  const fetchBookDetails = async () => {
    if (!bookId) return;
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/books/${bookId}`, { headers });
      const json = await parseApiResponse<{ success?: boolean; data?: BookDetailData; error?: string }>(res);

      if (json && json.data) {
        setBook(json.data);
      } else {
        throw new Error('Không tìm thấy thông tin đầu sách.');
      }
    } catch (err: any) {
      console.error('Error fetching book details:', err);
      setError(err.message || 'Không thể tải thông tin đầu sách.');
      showToast({
        type: 'error',
        title: 'Lỗi tải sách',
        message: 'Không thể kết nối đến máy chủ để lấy thông tin chi tiết đầu sách.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch Categories for Edit Modal selection
  const fetchCategories = async () => {
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
  };

  useEffect(() => {
    fetchBookDetails();
    fetchCategories();
  }, [bookId, accessToken]);

  // Handle Opening Edit Modal (after confirmation)
  const handleOpenEditModal = () => {
    if (!book) return;
    setConfirmEditOpen(false);
    setEditTitle(book.title || '');
    setEditAuthor(book.authorNames && book.authorNames.length > 0 ? book.authorNames[0] : '');
    setEditIsbn(book.isbn || '');
    setEditYear(book.publishedYear ? String(book.publishedYear) : '');
    setEditLanguage(book.language || 'vi');
    setEditPageCount(book.pageCount ? String(book.pageCount) : '');
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
      formData.append('Language', editLanguage || 'vi');
      if (editPageCount) formData.append('PageCount', editPageCount);
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
    } catch (err: any) {
      console.error('Error updating book:', err);
      showToast({
        type: 'error',
        title: 'Cập nhật thất bại',
        message: err.message || 'Có lỗi xảy ra khi cập nhật đầu sách.',
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
    } catch (err: any) {
      console.error('Error deleting book:', err);
      showToast({
        type: 'error',
        title: 'Xóa thất bại',
        message: err.message || 'Có lỗi xảy ra khi xóa đầu sách.',
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
            {book.coverImageUrl && (
              <div className="lib-book-cloudinary-tag">
                <Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} />
                Cloudinary Active
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
              <span className="lib-book-meta-label">Số trang</span>
              <span className="lib-book-meta-value">
                {book.pageCount ? `${book.pageCount} trang` : '---'}
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
                  </select>
                </div>
              </div>

              <div className="lib-form-grid-2">
                <div className="lib-cat-form-group">
                  <label>Số trang</label>
                  <input
                    type="number"
                    min="1"
                    value={editPageCount}
                    onChange={(e) => setEditPageCount(e.target.value)}
                    placeholder="Ví dụ: 350..."
                  />
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
                <label>Ảnh bìa sách (Cloudinary)</label>
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
