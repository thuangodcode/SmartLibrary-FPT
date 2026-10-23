import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Plus,
  Search,
  Layers,
  AlertCircle,
  BookMarked,
  Image as ImageIcon,
  RefreshCw,
  Library,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { parseApiResponse } from '../../../lib/api';
import './LibrarianCategoriesPage.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5278';

export interface CategoryItem {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  bookCount: number;
  createdAt?: string;
}

// Fallback background image patterns for categories without custom image
const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)',
  'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
  'linear-gradient(135deg, #0ba360 0%, #3cba92 100%)',
  'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
];

const LibrarianCategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { showToast } = useToast();

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/categories`, { headers });
      const json = await parseApiResponse<{ success?: boolean; data?: CategoryItem[]; error?: string }>(res);

      if (json && json.data && Array.isArray(json.data)) {
        setCategories(json.data);
      } else {
        setCategories([]);
      }
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      setError('Không thể tải danh sách danh mục sách. Vui lòng thử lại sau.');
      showToast({
        type: 'error',
        title: 'Lỗi tải danh mục',
        message: 'Không thể kết nối đến máy chủ để tải danh mục.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [accessToken]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const lower = searchTerm.toLowerCase().trim();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        (c.description && c.description.toLowerCase().includes(lower))
    );
  }, [categories, searchTerm]);

  // Aggregate stats
  const totalBooks = useMemo(() => {
    return categories.reduce((sum, c) => sum + (c.bookCount || 0), 0);
  }, [categories]);

  // Horizontal scroll helpers
  const scrollHorizontally = (offset: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  return (
    <div className="lib-cat-container">
      {/* Page Header */}
      <header className="lib-cat-header">
        <div className="lib-cat-header-info">
          <div className="lib-cat-eyebrow">
            <BookOpen size={15} />
            <span>KHÔNG GIAN THỦ THƯ • QUẢN LÝ BIÊN MỤC</span>
          </div>
          <h1>Sách & Biên mục</h1>
          <p className="lib-cat-desc">
            Phân loại danh mục sách, quản lý đầu sách và sắp xếp kho tài liệu thư viện trường FPT.
          </p>
        </div>

        <div className="lib-cat-actions">
          <button
            type="button"
            className="lib-cat-btn-add"
            onClick={() => navigate('/librarian/books/categories/new')}
          >
            <Plus size={18} />
            <span>Thêm danh mục sách</span>
          </button>
        </div>
      </header>

      {/* Quick Metrics Bar */}
      <section className="lib-cat-metrics-grid">
        <div className="lib-cat-metric-card">
          <div className="lib-cat-metric-icon orange">
            <Layers size={22} />
          </div>
          <div>
            <span className="lib-cat-metric-label">Tổng danh mục sách</span>
            <strong className="lib-cat-metric-value">{categories.length}</strong>
          </div>
        </div>

        <div className="lib-cat-metric-card">
          <div className="lib-cat-metric-icon blue">
            <BookMarked size={22} />
          </div>
          <div>
            <span className="lib-cat-metric-label">Tổng đầu sách đang quản lý</span>
            <strong className="lib-cat-metric-value">{totalBooks}</strong>
          </div>
        </div>

        <div className="lib-cat-metric-card">
          <div className="lib-cat-metric-icon green">
            <Library size={22} />
          </div>
          <div>
            <span className="lib-cat-metric-label">Hệ thống lưu trữ ảnh</span>
            <strong className="lib-cat-metric-value">Cloudinary Active</strong>
          </div>
        </div>
      </section>

      {/* Main Categories Panel - Model Inspired by Nhà Sách Phương Nam */}
      <section className="lib-cat-pnc-panel">
        <div className="lib-cat-pnc-header">
          <div className="lib-cat-pnc-title-group">
            <div className="lib-cat-pnc-pill">DANH MỤC THƯ VIỆN</div>
            <h2 className="lib-cat-pnc-title">Danh sách danh mục sách</h2>
            <span className="lib-cat-pnc-count">
              (Hiển thị {filteredCategories.length}/{categories.length} danh mục)
            </span>
          </div>

          <div className="lib-cat-pnc-controls">
            {/* Quick search */}
            <div className="lib-cat-pnc-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Tìm danh mục..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Refresh */}
            <button
              type="button"
              className="lib-cat-refresh-btn"
              onClick={fetchCategories}
              title="Làm mới danh sách"
            >
              <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            </button>

            {/* Scroll navigation arrows */}
            <div className="lib-cat-scroll-arrows">
              <button
                type="button"
                className="lib-cat-scroll-btn"
                onClick={() => scrollHorizontally(-240)}
                title="Cuộn sang trái"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="lib-cat-scroll-btn"
                onClick={() => scrollHorizontally(240)}
                title="Cuộn sang phải"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Categories Horizontal Strip */}
        {loading ? (
          <div className="lib-cat-pnc-loading">
            <div className="lib-cat-spinner" />
            <p>Đang tải danh mục sách...</p>
          </div>
        ) : error ? (
          <div className="lib-cat-pnc-error">
            <AlertCircle size={28} />
            <p>{error}</p>
            <button type="button" onClick={fetchCategories} className="lib-cat-retry-btn">
              Thử lại
            </button>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="lib-cat-pnc-empty">
            <ImageIcon size={42} />
            <p>{searchTerm ? `Không có danh mục nào phù hợp "${searchTerm}"` : 'Chưa có danh mục sách nào.'}</p>
            {!searchTerm && (
              <button
                type="button"
                className="lib-cat-btn-add-sm"
                onClick={() => navigate('/librarian/books/categories/new')}
              >
                <Plus size={16} />
                <span>Thêm danh mục mới</span>
              </button>
            )}
          </div>
        ) : (
          <div className="lib-cat-pnc-strip-wrapper">
            <div className="lib-cat-pnc-strip" ref={scrollContainerRef}>
              {filteredCategories.map((cat, idx) => {
                const fallbackGradient = FALLBACK_GRADIENTS[idx % FALLBACK_GRADIENTS.length];
                return (
                  <div
                    key={cat.id}
                    className="lib-cat-pnc-item"
                    onClick={() => navigate(`/librarian/books/categories/${cat.id}`)}
                    title={`Click để xem các đầu sách và quản lý "${cat.name}"`}
                  >
                    {/* Top: Category Image / Icon */}
                    <div className="lib-cat-pnc-icon-box">
                      {cat.imageUrl ? (
                        <img
                          src={cat.imageUrl}
                          alt={cat.name}
                          className="lib-cat-pnc-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="lib-cat-pnc-fallback" style={{ background: fallbackGradient }}>
                          <BookOpen size={28} color="#ffffff" />
                        </div>
                      )}
                    </div>

                    {/* Bottom: Only Category Name (Sample 1 Style) */}
                    <span className="lib-cat-pnc-name">{cat.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default LibrarianCategoriesPage;
