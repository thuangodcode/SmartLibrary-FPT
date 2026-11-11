import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Calendar,
  User,
  Clock,
  Pin,
  Sparkles,
  ArrowRight,
  BookOpen,
  ChevronRight,
  X,
} from 'lucide-react';
import HomeFooter from '../components/HomeFooter';
import HomeNavbar from '../components/HomeNavbar';
import { MOCK_FAQS } from '../mock';
import { API_BASE_URL } from '../../../config';
import './HomePage.css';
import './HomeInfoPage.css';
import { FALLBACK_NEWS, type NewsArticleItem } from './newsData';

type HomeInfoSection = 'news' | 'policies';

type NewsArticleApiItem = Partial<NewsArticleItem> & {
  Id?: string;
  Title?: string;
  Category?: string;
  Summary?: string;
  Content?: string;
  ImageUrl?: string | null;
  IsPinned?: boolean;
  AuthorName?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
  coverImageUrl?: string | null;
  publishedAt?: string;
};

const CATEGORIES = [
  'Tất cả',
  'Thông báo',
  'Sách mới',
  'Sự kiện',
  'Tính năng mới',
  'Hướng dẫn',
];

// Curated default news to ensure the user news section is NEVER empty
const pageCopy: Record<HomeInfoSection, { title: string; description: string }> = {
  news: {
    title: 'Tin tức & Thông báo',
    description: 'Cập nhật ngay tức thì những tin tức, sự kiện và quy định mới nhất từ Ban Quản trị SmartLibrary.',
  },
  policies: {
    title: 'Chính sách & Quy định',
    description: 'Thông tin hướng dẫn chi tiết về việc sử dụng tài liệu, cơ sở vật chất và các dịch vụ thư viện FPT.',
  },
};

const HomeInfoPage: React.FC<{ section: HomeInfoSection }> = ({ section }) => {
  const { title, description } = pageCopy[section];
  const navigate = useNavigate();

  // News states
  const [articles, setArticles] = useState<NewsArticleItem[]>(FALLBACK_NEWS);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [liveUpdatedToast, setLiveUpdatedToast] = useState<string | null>(null);

  // Fetch news from API with fallback
  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/news`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        if (list.length > 0) {
          // Normalize fields
          const mapped: NewsArticleItem[] = (list as NewsArticleApiItem[]).map((item) => ({
            id: String(item.id || item.Id),
            title: item.title || item.Title || '',
            category: item.category || item.Category || 'Thông báo',
            summary: item.summary || item.Summary || '',
            content: item.content || item.Content || '',
            imageUrl: item.imageUrl || item.coverImageUrl || item.ImageUrl || null,
            isPinned: Boolean(item.isPinned ?? item.IsPinned),
            authorName: item.authorName || item.AuthorName || 'Thủ thư SmartLibrary',
            createdAt: item.createdAt || item.publishedAt || item.CreatedAt || new Date().toISOString(),
            updatedAt: item.updatedAt || item.UpdatedAt,
          }));
          setArticles(mapped);
        } else {
          // If database is empty, maintain rich fallback news so it is NEVER empty
          setArticles(FALLBACK_NEWS);
        }
      } else {
        setArticles(FALLBACK_NEWS);
      }
    } catch {
      // In case of network/offline, always fall back so page is never empty
      setArticles(FALLBACK_NEWS);
    }
  }, []);

  useEffect(() => {
    if (section === 'news') {
      void Promise.resolve().then(() => fetchNews());
    }
  }, [section, fetchNews]);

  // Real-time synchronization: listen for SignalR broadcast event dispatched by HomeNavbar
  useEffect(() => {
    const handleNewsUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      const actionText = detail?.action === 'deleted' 
        ? 'đã xóa một thông báo' 
        : detail?.action === 'updated' 
        ? 'vừa cập nhật thông báo' 
        : 'vừa đăng thông báo mới';

      setLiveUpdatedToast(`Thủ thư ${actionText}: "${detail?.title || 'Tin tức mới'}"`);
      // Refetch immediately
      fetchNews();

      // Auto dismiss live toast after 5s
      setTimeout(() => {
        setLiveUpdatedToast(null);
      }, 5000);
    };

    window.addEventListener('smartlibrary:news-updated', handleNewsUpdated);
    return () => {
      window.removeEventListener('smartlibrary:news-updated', handleNewsUpdated);
    };
  }, [fetchNews]);

  // Filtered articles
  const filteredArticles = useMemo(() => {
    return articles.filter((item) => {
      const matchCat = selectedCategory === 'Tất cả' || item.category.toLowerCase() === selectedCategory.toLowerCase();
      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.summary.toLowerCase().includes(query) ||
        item.authorName.toLowerCase().includes(query);
      return matchCat && matchSearch;
    });
  }, [articles, selectedCategory, searchQuery]);

  // Pinned/Featured hero article
  const heroArticle = useMemo(() => {
    if (searchQuery || selectedCategory !== 'Tất cả') return null;
    return filteredArticles.find((a) => a.isPinned) || filteredArticles[0] || null;
  }, [filteredArticles, searchQuery, selectedCategory]);

  // Remaining list
  const listArticles = useMemo(() => {
    if (heroArticle && !searchQuery && selectedCategory === 'Tất cả') {
      return filteredArticles.filter((a) => a.id !== heroArticle.id);
    }
    return filteredArticles;
  }, [filteredArticles, heroArticle, searchQuery, selectedCategory]);

  // Format date helper
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Estimate read time
  const getReadTime = (content: string, summary: string) => {
    const text = (content || '') + ' ' + (summary || '');
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 150));
    return `${minutes} phút đọc`;
  };

  const openArticle = (article: NewsArticleItem) => navigate(`/news/${encodeURIComponent(article.id)}`);

  return (
    <div className="annual-home annual-info-page">
      <HomeNavbar activeSection={section === 'news' ? 'news' : undefined} />

      {/* Real-time live update pill banner if received SignalR broadcast */}
      {liveUpdatedToast && (
        <aside className="news-live-banner" role="status" aria-live="polite">
          <div className="news-live-banner-inner">
            <span className="news-live-dot" />
            <Sparkles size={16} className="text-amber-300" />
            <p className="news-live-banner-text">{liveUpdatedToast}</p>
            <button
              onClick={() => setLiveUpdatedToast(null)}
              className="news-live-banner-close"
              title="Đóng"
              aria-label="Đóng thông báo"
            >
              <X size={14} />
            </button>
          </div>
        </aside>
      )}

      <main className="annual-info-main news-theme-main">
        {section !== 'news' && (
          <header className="annual-info-heading news-custom-heading">
            <h1>{title}</h1>
            <p className="news-sub-description">{description}</p>
          </header>
        )}

        {section === 'news' && (
          <div className="news-container">
            {/* Filter Bar & Search */}
            <div className="news-toolbar">
              {/* Category Pills */}
              <div className="news-category-pills" role="tablist">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    role="tab"
                    aria-selected={selectedCategory === cat}
                    className={`news-pill-btn ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <form
                className="news-search-box"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearchQuery(searchInput.trim());
                }}
              >
                <Search size={16} className="news-search-icon" />
                <input
                  type="text"
                  placeholder="Tìm tin tức, thông báo, sự kiện..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="news-search-input"
                  aria-label="Tìm kiếm tin tức"
                />
                {(searchInput || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSearchQuery('');
                    }}
                    className="news-search-clear"
                    title="Xóa tìm kiếm"
                    aria-label="Xóa tìm kiếm"
                  >
                    <X size={14} />
                  </button>
                )}
                <button type="submit" className="news-search-submit">Tìm</button>
              </form>
            </div>

            {/* Hero / Spotlight Card (Only in 'Tất cả' view without search query) */}
            {heroArticle && (
              <section className="news-hero-section" aria-label="Tin tức nổi bật">
                <article
                  className="news-hero-card"
                  onClick={() => openArticle(heroArticle)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openArticle(heroArticle);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="news-hero-image-wrap">
                    <img
                      src={
                        heroArticle.imageUrl ||
                        'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?q=80&w=1200&auto=format&fit=crop'
                      }
                      alt={heroArticle.title}
                      className="news-hero-img"
                      loading="lazy"
                    />
                    <div className="news-hero-overlay" />
                    <div className="news-hero-tags">
                      <span className="news-cat-badge hero-cat">
                        {heroArticle.category}
                      </span>
                      {heroArticle.isPinned && (
                        <span className="news-pinned-badge">
                          <Pin size={12} className="rotate-45" /> Tin ghim
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="news-hero-content">
                    <h2 className="news-hero-title">{heroArticle.title}</h2>

                    <div className="news-item-meta">
                      <span className="meta-item">
                        <Calendar size={13} />
                        <time>{formatDate(heroArticle.createdAt)}</time>
                      </span>
                      <span className="meta-separator">•</span>
                      <span className="meta-item">
                        <User size={13} />
                        {heroArticle.authorName}
                      </span>
                      <span className="meta-separator">•</span>
                      <span className="meta-item">
                        <Clock size={13} />
                        {getReadTime(heroArticle.content, heroArticle.summary)}
                      </span>
                    </div>

                    <p className="news-hero-summary">{heroArticle.summary}</p>

                    <div className="news-hero-footer">
                      <button type="button" className="news-read-hero-btn" onClick={() => openArticle(heroArticle)}>
                        <span>Đọc bài viết chi tiết</span>
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              </section>
            )}

            {/* Grid of Articles */}
            <section className="news-grid-section" aria-label="Danh sách tin tức">
              {listArticles.length > 0 ? (
                <div className="news-grid">
                  {listArticles.map((item) => (
                    <article
                      key={item.id}
                      className="news-card"
                      onClick={() => openArticle(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openArticle(item);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="news-card-thumb">
                        <img
                          src={
                            item.imageUrl ||
                            'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?q=80&w=800&auto=format&fit=crop'
                          }
                          alt={item.title}
                          loading="lazy"
                        />
                        <div className="news-card-badge-row">
                          <span className="news-cat-badge">{item.category}</span>
                          {item.isPinned && (
                            <span className="news-pinned-badge mini">
                              <Pin size={10} /> Ghim
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="news-card-body">
                        <h3 className="news-card-title">{item.title}</h3>

                        <div className="news-card-meta">
                          <span className="meta-item">
                            <Calendar size={12} />
                            <time>{formatDate(item.createdAt)}</time>
                          </span>
                          <span className="meta-separator">•</span>
                          <span className="meta-item">
                            <Clock size={12} />
                            {getReadTime(item.content, item.summary)}
                          </span>
                        </div>

                        <p className="news-card-excerpt">{item.summary}</p>

                        <div className="news-card-footer">
                          <span className="news-card-author">
                            <User size={12} />
                            {item.authorName}
                          </span>
                          <span className="news-card-arrow">
                            Chi tiết <ChevronRight size={14} />
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                /* Fallback reassurance: This will almost never be reached, but guarantees clean visuals if search query has no match */
                <div className="news-empty-search">
                  <BookOpen size={48} className="text-gray-400 mb-3" />
                  <h3>Không tìm thấy bài viết phù hợp</h3>
                  <p>
                    Không có tin tức nào khớp với từ khóa "{searchQuery}". Bạn hãy thử tìm
                    với từ khóa khác hoặc xóa bộ lọc.
                  </p>
                  <button
                    className="news-clear-filter-btn"
                    onClick={() => {
                      setSearchInput('');
                      setSearchQuery('');
                      setSelectedCategory('Tất cả');
                    }}
                  >
                    Xem tất cả bài viết
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Policies Section (Maintained for existing policies view) */}
        {section === 'policies' && (
          <section className="annual-info-policy-list" aria-label="Các chính sách và quy định">
            {MOCK_FAQS.map((item, index) => (
              <article className="annual-info-policy-item" key={item.id}>
                <span>0{index + 1} · {item.category}</span>
                <h2>{item.question}</h2>
                <p>{item.answer}</p>
              </article>
            ))}
          </section>
        )}
      </main>

      <HomeFooter />
    </div>
  );
};

export default HomeInfoPage;
