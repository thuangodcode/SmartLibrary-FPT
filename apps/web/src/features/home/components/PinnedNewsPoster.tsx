import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Pin, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import './PinnedNewsPoster.css';

interface PinnedArticle {
  id: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  isPinned: boolean;
}

const dismissedKey = 'smartlibrary:pinned-news-poster:dismissed';

const PinnedNewsPoster: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [article, setArticle] = useState<PinnedArticle | null>(null);
  const [visible, setVisible] = useState(false);
  const isStaffPage = location.pathname.startsWith('/librarian') || location.pathname.startsWith('/admin');
  const dismiss = useCallback(() => {
    window.sessionStorage.setItem(dismissedKey, '1');
    setVisible(false);
  }, []);

  useEffect(() => {
    if (window.sessionStorage.getItem(dismissedKey)) return;
    let cancelled = false;

    const loadPinnedArticle = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/news?isPinned=true`);
        if (!response.ok) return;
        const result = await response.json();
        const items = Array.isArray(result) ? result : result?.data ?? [];
        const pinned = (items as PinnedArticle[]).find((item) => item.isPinned && item.imageUrl);
        if (!cancelled && pinned) {
          setArticle(pinned);
          setVisible(true);
        }
      } catch {
        // The poster is an enhancement; keep the rest of the site usable offline.
      }
    };

    void loadPinnedArticle();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!visible || isStaffPage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, isStaffPage, dismiss]);

  if (!article || !visible || isStaffPage) return null;

  const openArticle = () => {
    dismiss();
    navigate(`/news/${article.id}`);
  };

  return (
    <div className="pinned-poster-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section className="pinned-poster-dialog" role="dialog" aria-modal="true" aria-labelledby="pinned-poster-title">
        <button type="button" className="pinned-poster-close" onClick={dismiss} aria-label="Đóng poster"><X size={19} /></button>
        <button type="button" className="pinned-poster-artwork" onClick={openArticle} aria-label={`Mở bài viết: ${article.title}`}>
          <img src={article.imageUrl!} alt="" />
          <span className="pinned-poster-shade" />
          <span className="pinned-poster-tag"><Pin size={14} /> Tin nổi bật</span>
          <span className="pinned-poster-copy">
            <span className="pinned-poster-kicker">SMARTLIBRARY · THÔNG BÁO</span>
            <strong id="pinned-poster-title">{article.title}</strong>
            {article.summary && <span className="pinned-poster-summary">{article.summary}</span>}
            <span className="pinned-poster-cta">Xem chi tiết <ArrowUpRight size={17} /></span>
          </span>
        </button>
      </section>
    </div>
  );
};

export default PinnedNewsPoster;
