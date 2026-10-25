import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Calendar,
  User,
  Clock,
  Pin,
  Sparkles,
  ArrowRight,
  X,
  Share2,
  BookOpen,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import HomeFooter from '../components/HomeFooter';
import HomeNavbar from '../components/HomeNavbar';
import { MOCK_FAQS } from '../mock';
import { API_BASE_URL } from '../../../config';
import './HomePage.css';
import './HomeInfoPage.css';

type HomeInfoSection = 'news' | 'policies';

export interface NewsArticleItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  imageUrl?: string | null;
  isPinned: boolean;
  authorName: string;
  createdAt: string;
  updatedAt?: string;
}

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
const FALLBACK_NEWS: NewsArticleItem[] = [
  {
    id: 'seed-1',
    title: 'Thư viện SmartLibrary chính thức tích hợp AI Tìm kiếm Ngữ Nghĩa & Đề xuất sách thông minh',
    category: 'Tính năng mới',
    summary: 'Sinh viên FPT giờ đây có thể tìm kiếm sách bằng các câu hỏi tự nhiên như "Sách học vẽ sơ đồ tư duy cho dân IT" mà không cần nhớ chính xác tên tác giả hoặc mã sách.',
    content: `Chào đón học kỳ mới 2026, SmartLibrary trân trọng thông báo ra mắt tính năng Tìm kiếm Ngữ nghĩa (Semantic AI Search) và Trợ lý ảo gợi ý sách tự động.\n\nVới công nghệ Vector Database và Embedding tiên tiến, hệ thống có khả năng hiểu ngữ cảnh câu hỏi, gợi ý sách dựa trên chuyên ngành, môn học đang theo học và hành vi đọc của từng sinh viên.\n\nCác bạn sinh viên chỉ cần gõ nội dung muốn tìm kiếm vào thanh tìm kiếm AI tại trang chủ để nhận được các đầu sách phù hợp nhất kèm tỷ lệ độ khớp (Match Score).`,
    imageUrl: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?q=80&w=1200&auto=format&fit=crop',
    isPinned: true,
    authorName: 'Thủ thư Trưởng',
    createdAt: '2026-10-24T08:30:00Z',
  },
  {
    id: 'seed-2',
    title: 'Thông báo lịch mở cửa phòng tự học 24/7 xuyên suốt kỳ thi Học kỳ 1 (2026 - 2027)',
    category: 'Thông báo',
    summary: 'Phòng tự học đa năng tại tầng 2 và khu vực Quiet Zone tầng 3 sẽ mở cửa xuyên đêm 24/7 phục vụ các bạn sinh viên ôn thi từ ngày 05/10 đến hết ngày 25/10.',
    content: `Nhằm tạo điều kiện tốt nhất cho sinh viên trong mùa thi cử cam go, Thư viện SmartLibrary - Đại học FPT thông báo điều chỉnh thời gian phục vụ:\n\n1. Khu vực mở cửa 24/7: Toàn bộ tầng 2 (Khu thảo luận nhóm) và Quiet Zone tầng 3.\n2. Tiện ích kèm theo: Hệ thống điều hòa, Wi-Fi tốc độ cao, máy nước nóng lạnh và khu vực sạc laptop được trang bị đầy đủ tại từng bàn.\n3. Lưu ý an ninh: Độc giả vui lòng xuất trình thẻ sinh viên hoặc quét mã QR trên ứng dụng SmartLibrary khi ra vào sau 21h00.`,
    imageUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?q=80&w=1200&auto=format&fit=crop',
    isPinned: true,
    authorName: 'Ban Quản trị Thư viện',
    createdAt: '2026-10-22T09:00:00Z',
  },
  {
    id: 'seed-3',
    title: 'Cập nhật hơn 500+ đầu sách Công nghệ Thông tin, AI & Kỹ năng mềm mới nhập kho',
    category: 'Sách mới',
    summary: 'Hàng loạt sách chuyên khảo chất lượng quốc tế về Machine Learning, React 19, Thiết kế hệ thống phân tán và Kỹ năng lãnh đạo đã có mặt trên kệ sách.',
    content: `Thư viện vừa hoàn tất thủ tục phân loại, dán mã RFID và nhập kho hơn 500 đầu sách mới phục vụ các khối ngành CNTT, An toàn thông tin, Thiết kế đồ họa và Quản trị kinh doanh.\n\nMột số tựa sách tiêu biểu:\n- Designing Data-Intensive Applications (Bản cập nhật)\n- Deep Learning with PyTorch & Generative AI in Practice\n- Clean Architecture & Domain-Driven Design\n- Tư duy phản biện và Năng lực ra quyết định trong thời đại số\n\nĐộc giả có thể tra cứu và đặt giữ sách trước trên Web hoặc ứng dụng di động ngay hôm nay!`,
    imageUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=1200&auto=format&fit=crop',
    isPinned: false,
    authorName: 'Bộ phận Bổ sung Tài liệu',
    createdAt: '2026-10-18T14:15:00Z',
  },
  {
    id: 'seed-4',
    title: 'Hội thảo Book Talk: "Văn hóa đọc trong kỷ nguyên Trí tuệ Nhân tạo"',
    category: 'Sự kiện',
    summary: 'Giao lưu cùng diễn giả khách mời, tác giả sách công nghệ nổi tiếng và nhận hàng trăm phần quà cùng voucher mượn sách không giới hạn.',
    content: `Thư viện phối hợp cùng CLB Sách FPT tổ chức buổi Workshop & Book Talk đặc biệt vào sáng thứ Bảy tuần này tại Hội trường Thư viện.\n\nNội dung chính:\n- Làm sao để duy trì sự tập trung sâu khi đọc sách trong thời đại ngập tràn video ngắn?\n- Tận dụng AI để tóm tắt và ghi nhớ kiến thức từ sách chuyên khảo hiệu quả.\n- Minigame đố vui nhận sách có chữ ký tác giả và thẻ mượn sách ưu tiên.\n\nThời gian: 09h00 - 11h30 Thứ Bảy. Đăng ký tham gia miễn phí qua ứng dụng SmartLibrary!`,
    imageUrl: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?q=80&w=1200&auto=format&fit=crop',
    isPinned: false,
    authorName: 'CLB Sách FPT',
    createdAt: '2026-10-15T10:00:00Z',
  },
  {
    id: 'seed-5',
    title: 'Hướng dẫn sử dụng tủ gửi đồ thông minh bằng nhận diện khuôn mặt & thẻ sinh viên',
    category: 'Hướng dẫn',
    summary: 'Các bước thao tác nhanh với hệ thống Smart Locker tại sảnh vào thư viện: check-in tự động, giữ đồ an toàn và tiện lợi.',
    content: `Nhằm đảm bảo an toàn tài sản và không gian yên tĩnh bên trong thư viện, SmartLibrary đã đưa vào vận hành hệ thống Smart Locker 200 ngăn tại sảnh tầng 1.\n\nCách sử dụng:\n1. Chạm thẻ sinh viên hoặc đứng trước màn hình nhận diện khuôn mặt.\n2. Một ngăn tủ sẽ tự động bật mở. Đặt ba lô, túi xách vào ngăn và đóng chặt cửa tủ.\n3. Khi ra về, quét lại thẻ sinh viên hoặc FaceID tại đúng vị trí ban đầu để mở tủ lấy đồ.\n\nLưu ý: Không để tài sản có giá trị cao hoặc qua đêm tại tủ gửi đồ.`,
    imageUrl: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?q=80&w=1200&auto=format&fit=crop',
    isPinned: false,
    authorName: 'Ban Quản trị Thư viện',
    createdAt: '2026-10-10T16:30:00Z',
  },
  {
    id: 'seed-6',
    title: 'Nâng cấp hạn mức mượn sách tài liệu điện tử (E-Book & Luận văn số)',
    category: 'Thông báo',
    summary: 'Sinh viên thực hiện đồ án tốt nghiệp và học viên cao học được tăng hạn mức tải và đọc tài liệu nghiên cứu số lên 20 tài liệu/tháng.',
    content: `Hệ thống Thư viện số SmartLibrary trân trọng thông báo nâng cấp hạn mức truy cập cơ sở dữ liệu số cho sinh viên học kỳ 7, 8, 9 và các học viên đang làm luận văn tốt nghiệp.\n\nBạn có thể truy cập kho luận văn xuất sắc các khóa trước, tạp chí khoa học chuyên ngành và giáo trình điện tử bản quyền từ cổng e-Library mà không bị giới hạn số lần đọc trong ngày.`,
    imageUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=1200&auto=format&fit=crop',
    isPinned: false,
    authorName: 'Bộ phận Thư viện Số',
    createdAt: '2026-10-05T11:00:00Z',
  },
];

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

  // News states
  const [articles, setArticles] = useState<NewsArticleItem[]>(FALLBACK_NEWS);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeArticle, setActiveArticle] = useState<NewsArticleItem | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
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

  useEffect(() => {
    if (!activeArticle) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveArticle(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [activeArticle]);

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

  const handleShare = (article: NewsArticleItem) => {
    const shareUrl = window.location.origin + `/news?id=${article.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

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
                  onClick={() => setActiveArticle(heroArticle)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setActiveArticle(heroArticle);
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
                      <button className="news-read-hero-btn">
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
                      onClick={() => setActiveArticle(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setActiveArticle(item);
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

      {/* Full Article Reading Modal */}
      {activeArticle && (
        <div
          className="news-modal-overlay"
          onClick={() => setActiveArticle(null)}
        >
          <div
            className="news-modal-content"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="news-article-title"
          >
            {/* Modal Header Bar */}
            <div className="news-modal-bar">
              <div className="news-modal-chips">
                <span className="news-cat-badge">{activeArticle.category}</span>
                {activeArticle.isPinned && (
                  <span className="news-pinned-badge">
                    <Pin size={11} /> Ghim nổi bật
                  </span>
                )}
              </div>
              <div className="news-modal-actions">
                <button
                  className="news-icon-btn"
                  onClick={() => handleShare(activeArticle)}
                  title="Sao chép liên kết"
                >
                  {isCopied ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Share2 size={16} />}
                  <span className="text-xs">{isCopied ? 'Đã chép' : 'Chia sẻ'}</span>
                </button>
                <button
                  className="news-icon-btn close-btn"
                  onClick={() => setActiveArticle(null)}
                  title="Đóng cửa sổ"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="news-modal-scroll">
              {activeArticle.imageUrl && (
                <div className="news-modal-hero-cover">
                  <img
                    src={activeArticle.imageUrl}
                    alt={activeArticle.title}
                  />
                </div>
              )}

              <header className="news-modal-header">
                <div className="news-modal-meta">
                  <span className="meta-item">
                    <Calendar size={14} />
                    <time>{formatDate(activeArticle.createdAt)}</time>
                  </span>
                  <span className="meta-separator">•</span>
                  <span className="meta-item">
                    <User size={14} />
                    {activeArticle.authorName}
                  </span>
                  <span className="meta-separator">•</span>
                  <span className="meta-item">
                    <Clock size={14} />
                    {getReadTime(activeArticle.content, activeArticle.summary)}
                  </span>
                </div>
                <h2 id="news-article-title" className="news-modal-title">{activeArticle.title}</h2>
              </header>

              {activeArticle.summary && (
                <div className="news-modal-lead-summary">
                  <p>{activeArticle.summary}</p>
                </div>
              )}

              <div className="news-modal-article-body">
                {activeArticle.content ? (
                  activeArticle.content.split('\n\n').map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                  ))
                ) : (
                  <p>{activeArticle.summary}</p>
                )}
              </div>

              <footer className="news-modal-footer">
                <div className="news-modal-author-card">
                  <div className="news-author-avatar">
                    <User size={20} />
                  </div>
                  <div>
                    <h4>{activeArticle.authorName}</h4>
                    <p>Ban Quản trị Thư viện SmartLibrary - FPT University</p>
                  </div>
                </div>
                <button
                  className="news-close-modal-bottom-btn"
                  onClick={() => setActiveArticle(null)}
                >
                  Đóng bài viết
                </button>
              </footer>
            </div>
          </div>
        </div>
      )}

      <HomeFooter />
    </div>
  );
};

export default HomeInfoPage;
