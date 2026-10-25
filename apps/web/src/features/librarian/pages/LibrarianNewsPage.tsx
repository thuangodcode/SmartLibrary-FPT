import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  Bell,
  Plus,
  Search,
  Pencil,
  Trash2,
  Pin,
  UploadCloud,
  X,
  AlertCircle,
  RefreshCw,
  User,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { parseApiResponse } from '../../../lib/api';
import { API_BASE_URL } from '../../../config';
import './LibrarianNewsPage.css';

export interface NewsArticleItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  imageUrl?: string | null;
  isPinned: boolean;
  isPublished: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  'Tất cả',
  'Thông báo',
  'Sách mới',
  'Sự kiện',
  'Tính năng mới',
  'Hướng dẫn',
];

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const LibrarianNewsPage: React.FC = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const { showToast } = useToast();

  const [articles, setArticles] = useState<NewsArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');

  // Modal create/edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<NewsArticleItem | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Thông báo');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [authorName, setAuthorName] = useState(user?.fullName || 'Thủ thư FPT');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation
  const [deletingArticle, setDeletingArticle] = useState<NewsArticleItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/news`);
      const json = await parseApiResponse<{ success?: boolean; data?: NewsArticleItem[] }>(res);
      if (json && json.data) {
        setArticles(json.data);
      } else {
        setArticles([]);
      }
    } catch (err: unknown) {
      console.error('Error fetching news:', err);
      showToast({
        type: 'error',
        title: 'Lỗi tải tin tức',
        message: 'Không thể kết nối máy chủ để tải danh sách tin tức.',
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchNews());
  }, [fetchNews]);

  // Filtered articles
  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      const matchSearch =
        !searchTerm.trim() ||
        a.title.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        a.summary.toLowerCase().includes(searchTerm.toLowerCase().trim());
      const matchCat =
        selectedCategory === 'Tất cả' || a.category.toLowerCase() === selectedCategory.toLowerCase();
      return matchSearch && matchCat;
    });
  }, [articles, searchTerm, selectedCategory]);

  const pinnedCount = useMemo(() => articles.filter((a) => a.isPinned).length, [articles]);

  const handleOpenCreate = () => {
    setEditingArticle(null);
    setTitle('');
    setCategory('Thông báo');
    setSummary('');
    setContent('');
    setIsPinned(false);
    setAuthorName(user?.fullName || 'Thủ thư FPT');
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (art: NewsArticleItem) => {
    setEditingArticle(art);
    setTitle(art.title);
    setCategory(art.category);
    setSummary(art.summary);
    setContent(art.content);
    setIsPinned(art.isPinned);
    setAuthorName(art.authorName || 'Thủ thư FPT');
    setImageFile(null);
    setImagePreview(art.imageUrl || null);
    setRemoveImage(false);
    setIsModalOpen(true);
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showToast({
        type: 'error',
        title: 'Định dạng ảnh không hợp lệ',
        message: 'Chỉ chấp nhận các tệp ảnh JPG, PNG, WEBP hoặc GIF.',
      });
      return;
    }
    setImageFile(file);
    setRemoveImage(false);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      showToast({
        type: 'warning',
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập tiêu đề thông báo.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('Title', trimmedTitle);
      formData.append('Category', category);
      formData.append('Summary', summary.trim() || trimmedTitle);
      formData.append('Content', content.trim() || summary.trim() || trimmedTitle);
      formData.append('IsPinned', String(isPinned));
      formData.append('AuthorName', authorName.trim() || 'Thủ thư FPT');
      if (imageFile) formData.append('Image', imageFile);
      if (editingArticle && removeImage) formData.append('RemoveImage', 'true');

      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const endpoint = editingArticle
        ? `${API_BASE_URL}/api/v1/news/${editingArticle.id}/form`
        : `${API_BASE_URL}/api/v1/news/form`;
      const method = editingArticle ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers,
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || json?.message || 'Không thể lưu bài viết.');
      }

      showToast({
        type: 'success',
        title: editingArticle ? 'Cập nhật thành công' : 'Đã phát thông báo mới',
        message: editingArticle
          ? `Đã cập nhật bài viết "${trimmedTitle}" thành công!`
          : `Thông báo "${trimmedTitle}" đã được đăng và gửi realtime đến độc giả!`,
      });

      setIsModalOpen(false);
      void fetchNews();
    } catch (err: unknown) {
      console.error('Error saving news:', err);
      showToast({
        type: 'error',
        title: 'Thao tác thất bại',
        message: errorMessage(err, 'Có lỗi xảy ra khi lưu bài viết.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingArticle) return;
    setIsDeleting(true);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/news/${deletingArticle.id}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Xóa thông báo thất bại.');
      }

      showToast({
        type: 'success',
        title: 'Đã xóa thông báo',
        message: `Đã xóa bài viết "${deletingArticle.title}".`,
      });

      setDeletingArticle(null);
      void fetchNews();
    } catch (err: unknown) {
      console.error('Error deleting news:', err);
      showToast({
        type: 'error',
        title: 'Lỗi xóa thông báo',
        message: errorMessage(err, 'Không thể xóa bài viết.'),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="lib-news-container">
      {/* ─── Header ─── */}
      <header className="lib-news-header">
        <div>
          <div className="lib-news-eyebrow">
            <Bell size={14} />
            <span>KHÔNG GIAN THỦ THƯ • TRUYỀN THÔNG & THÔNG BÁO</span>
          </div>
          <h1>Tin tức & Thông báo Thư viện</h1>
          <p className="lib-news-desc">
            Đăng thông báo, tin tức sự kiện, cập nhật sách mới và phát thông điệp thời gian thực (realtime) tới toàn bộ người dùng & độc giả.
          </p>
        </div>

        <button type="button" className="lib-news-btn-add" onClick={handleOpenCreate}>
          <Plus size={18} />
          <span>Đăng thông báo mới</span>
        </button>
      </header>

      {/* ─── Metrics ─── */}
      <section className="lib-news-metrics">
        <div className="lib-news-metric-card">
          <div className="lib-news-metric-icon orange">
            <Bell size={22} />
          </div>
          <div>
            <span className="lib-news-metric-label">Tổng bài viết / thông báo</span>
            <strong className="lib-news-metric-value">{articles.length}</strong>
          </div>
        </div>

        <div className="lib-news-metric-card">
          <div className="lib-news-metric-icon blue">
            <Pin size={22} />
          </div>
          <div>
            <span className="lib-news-metric-label">Thông báo đang ghim ưu tiên</span>
            <strong className="lib-news-metric-value">{pinnedCount}</strong>
          </div>
        </div>
      </section>

      {/* ─── Toolbar ─── */}
      <section className="lib-news-toolbar">
        <div className="lib-news-search-box">
          <Search size={16} color="#64748b" />
          <input
            type="text"
            placeholder="Tìm kiếm thông báo theo tiêu đề, nội dung..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="lib-news-category-filter">
          {CATEGORIES.map((cat) => (
            <button
              type="button"
              key={cat}
              className={`lib-news-filter-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
          <button
            type="button"
            className="lib-news-btn-icon"
            onClick={fetchNews}
            title="Tải lại danh sách"
          >
            <RefreshCw size={15} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </section>

      {/* ─── News Grid ─── */}
      {loading ? (
        <div className="lib-news-empty">
          <RefreshCw size={36} className="spinning" color="#ea580c" />
          <p>Đang tải danh sách tin tức & thông báo...</p>
        </div>
      ) : filteredArticles.length === 0 ? (
        <div className="lib-news-empty">
          <Bell size={44} color="#cbd5e1" />
          <h3>Không tìm thấy bài viết nào</h3>
          <p>
            {searchTerm
              ? `Không có bài viết phù hợp từ khóa "${searchTerm}".`
              : 'Chưa có thông báo nào. Bấm nút phía trên để đăng thông báo đầu tiên!'}
          </p>
          {!searchTerm && (
            <button type="button" className="lib-news-btn-add" onClick={handleOpenCreate}>
              <Plus size={16} />
              <span>Đăng bài đầu tiên</span>
            </button>
          )}
        </div>
      ) : (
        <div className="lib-news-grid">
          {filteredArticles.map((art) => (
            <article key={art.id} className="lib-news-card">
              <div className="lib-news-card-image">
                {art.imageUrl ? (
                  <img src={art.imageUrl} alt={art.title} loading="lazy" />
                ) : (
                  <div className="lib-news-card-image-fallback">
                    <Bell size={36} />
                  </div>
                )}
                {art.isPinned && (
                  <div className="lib-news-pinned-badge">
                    <Pin size={12} />
                    <span>Đang ghim</span>
                  </div>
                )}
              </div>

              <div className="lib-news-card-body">
                <div className="lib-news-meta-row">
                  <span className="lib-news-category-tag">{art.category}</span>
                  <span className="lib-news-date">
                    {new Date(art.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                <h3 className="lib-news-card-title" title={art.title}>
                  {art.title}
                </h3>

                <p className="lib-news-card-summary">{art.summary}</p>

                <div className="lib-news-card-footer">
                  <span className="lib-news-author">
                    <User size={13} />
                    <span>{art.authorName || 'Thủ thư FPT'}</span>
                  </span>

                  <div className="lib-news-actions">
                    <button
                      type="button"
                      className="lib-news-btn-icon"
                      onClick={() => handleOpenEdit(art)}
                      title="Chỉnh sửa thông báo"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="lib-news-btn-icon danger"
                      onClick={() => setDeletingArticle(art)}
                      title="Xóa thông báo"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ─── Modal Create/Edit ─── */}
      {isModalOpen && (
        <div className="lib-news-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="lib-news-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="lib-news-modal-header">
              <h3>{editingArticle ? 'Chỉnh sửa thông báo' : 'Đăng thông báo mới'}</h3>
              <button
                type="button"
                className="lib-news-modal-close"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="lib-news-form">
              <div className="lib-news-form-group">
                <label>
                  Tiêu đề thông báo <span className="req">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Thông báo mở cửa phòng tự học 24/7 mùa thi..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="lib-news-form-row">
                <div className="lib-news-form-group">
                  <label>Danh mục tin</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="Thông báo">Thông báo quan trọng</option>
                    <option value="Sách mới">Sách mới nhập kho</option>
                    <option value="Sự kiện">Sự kiện & Workshop</option>
                    <option value="Tính năng mới">Tính năng mới</option>
                    <option value="Hướng dẫn">Hướng dẫn độc giả</option>
                  </select>
                </div>

                <div className="lib-news-form-group">
                  <label>Người đăng / Tác giả</label>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Ban Quản lý Thư viện FPT"
                  />
                </div>
              </div>

              <div className="lib-news-checkbox-row" onClick={() => setIsPinned(!isPinned)}>
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                />
                <span>Ghim bài viết này lên vị trí nổi bật đầu trang tin tức của độc giả</span>
              </div>

              <div className="lib-news-form-group">
                <label>Tóm tắt ngắn (1-2 câu)</label>
                <textarea
                  rows={2}
                  placeholder="Mô tả tóm tắt nội dung chính hiển thị ở danh thiếp tin tức..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>

              <div className="lib-news-form-group">
                <label>Nội dung chi tiết bài viết</label>
                <textarea
                  rows={5}
                  placeholder="Nhập toàn văn thông báo hoặc nội dung tin tức..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>

              {/* Cover image upload */}
              <div className="lib-news-form-group">
                <label>Hình ảnh bài viết</label>
                <div className="lib-news-image-upload-row">
                  {imagePreview ? (
                    <div className="lib-news-preview-box">
                      <img src={imagePreview} alt="Preview" />
                      <button
                        type="button"
                        className="lib-news-btn-remove-img"
                        onClick={() => {
                          setImagePreview(null);
                          setImageFile(null);
                          setRemoveImage(true);
                        }}
                        title="Xóa ảnh này"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="lib-news-preview-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Bell size={22} color="#94a3b8" />
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
                      className="lib-news-btn-choose-file"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud size={16} />
                      <span>{imagePreview ? 'Thay đổi ảnh' : 'Tải ảnh bài viết'}</span>
                    </button>
                    <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '6px 0 0 0' }}>
                      Định dạng JPG, PNG, WEBP (Tối đa 10MB)
                    </p>
                  </div>
                </div>
              </div>

              <div className="lib-news-modal-actions">
                <button
                  type="button"
                  className="lib-news-btn-cancel"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  Hủy bỏ
                </button>
                <button type="submit" className="lib-news-btn-submit" disabled={submitting}>
                  {submitting ? 'Đang phát thông báo...' : editingArticle ? 'Lưu thay đổi' : 'Đăng & Phát realtime'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {deletingArticle && (
        <div className="lib-news-modal-overlay" onClick={() => setDeletingArticle(null)}>
          <div className="lib-news-modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', color: '#dc2626' }}>
              <AlertCircle size={44} style={{ margin: '0 auto 12px' }} />
              <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Xác nhận xóa thông báo?</h3>
            </div>
            <p style={{ textAlign: 'center', margin: 0, color: '#64748b', fontSize: 13.5 }}>
              Bạn có chắc chắn muốn xóa bài viết <strong>"{deletingArticle.title}"</strong>?
              Thao tác này sẽ gỡ bài viết khỏi cổng độc giả ngay lập tức.
            </p>
            <div className="lib-news-modal-actions" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="lib-news-btn-cancel"
                onClick={() => setDeletingArticle(null)}
                disabled={isDeleting}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="lib-news-btn-submit"
                style={{ background: '#dc2626' }}
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibrarianNewsPage;
