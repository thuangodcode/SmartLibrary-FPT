import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Check, Clock3, Eye, EyeOff, MessageCircle, Pin, Send, Share2, Trash2, UserRound } from 'lucide-react';
import HomeFooter from '../components/HomeFooter';
import HomeNavbar from '../components/HomeNavbar';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { FALLBACK_NEWS, type NewsArticleItem } from './newsData';
import './HomePage.css';
import './HomeInfoPage.css';
import './NewsArticleDetailPage.css';

interface ApiEnvelope<T> { success?: boolean; data?: T; error?: string }

interface NewsComment {
  id: string;
  parentCommentId: string | null;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

const formatDate = (value: string) => new Date(value).toLocaleDateString('vi-VN', {
  day: 'numeric', month: 'long', year: 'numeric',
});

const readTime = (article: NewsArticleItem) => {
  const words = `${article.content} ${article.summary}`.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 150))} phút đọc`;
};

const NewsArticleDetailPage: React.FC<{ librarianMode?: boolean }> = ({ librarianMode = false }) => {
  const { articleId = '' } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [article, setArticle] = useState<NewsArticleItem | null>(null);
  const [comments, setComments] = useState<NewsComment[]>([]);
  const [loadingArticle, setLoadingArticle] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentsError, setCommentsError] = useState('');
  const [draft, setDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const canModerate = user?.role === 'Librarian' || user?.role === 'Admin';
  const canComment = Boolean(accessToken) && (
    user?.role === 'Reader' || user?.role === 'Librarian' || user?.role === 'Admin'
  );

  const loadComments = useCallback(async () => {
    if (!articleId) return;
    if (articleId.startsWith('seed-')) {
      setComments([]);
      setCommentsError('');
      setLoadingComments(false);
      return;
    }
    setLoadingComments(true);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const response = await fetch(`${API_BASE_URL}/api/v1/news/${encodeURIComponent(articleId)}/comments`, { headers });
      const result = await parseApiResponse<ApiEnvelope<NewsComment[]>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không tải được bình luận.');
      setComments(result.data ?? []);
      setCommentsError('');
    } catch (error) {
      setCommentsError(error instanceof Error ? error.message : 'Không tải được bình luận.');
    } finally {
      setLoadingComments(false);
    }
  }, [articleId, accessToken]);

  useEffect(() => {
    let cancelled = false;
    const loadArticle = async () => {
      setLoadingArticle(true);
      try {
        if (articleId.startsWith('seed-')) {
          const seeded = FALLBACK_NEWS.find((item) => item.id === articleId);
          if (seeded && !cancelled) setArticle(seeded);
          else if (!cancelled) setArticle(null);
          return;
        }
        const response = await fetch(`${API_BASE_URL}/api/v1/news/${encodeURIComponent(articleId)}`);
        const result = await parseApiResponse<ApiEnvelope<NewsArticleItem>>(response);
        if (!response.ok || !result?.success || !result.data) throw new Error(result?.error || 'Không tìm thấy bài viết.');
        if (!cancelled) setArticle(result.data);
      } catch {
        if (!cancelled) setArticle(null);
      } finally {
        if (!cancelled) setLoadingArticle(false);
      }
    };
    void loadArticle();
    return () => { cancelled = true; };
  }, [articleId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadComments(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadComments]);

  // Độc giả chỉ thấy bình luận chưa ẩn; thủ thư vẫn thấy cả bình luận đã ẩn
  const listedComments = useMemo(
    () => (canModerate ? comments : comments.filter((comment) => !comment.isDeleted)),
    [canModerate, comments],
  );
  const topLevelComments = useMemo(
    () => listedComments.filter((comment) => !comment.parentCommentId),
    [listedComments],
  );
  const replies = useMemo(
    () => listedComments.filter((comment) => comment.parentCommentId),
    [listedComments],
  );

  const postComment = async (event: FormEvent, parentCommentId: string | null = null) => {
    event.preventDefault();
    const content = (parentCommentId ? replyDraft : draft).trim();
    if (!content || !accessToken || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/news/${encodeURIComponent(articleId)}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parentCommentId }),
      });
      const result = await parseApiResponse<ApiEnvelope<NewsComment>>(response);
      if (!response.ok || !result?.success || !result.data) throw new Error(result?.error || 'Chưa gửi được bình luận.');
      setComments((current) => [...current, result.data!]);
      if (parentCommentId) {
        setReplyTarget(null);
        setReplyDraft('');
      } else setDraft('');
      showToast({ type: 'success', title: 'Đã gửi bình luận', message: 'Bình luận của bạn đã được đăng.' });
    } catch (error) {
      showToast({ type: 'error', title: 'Không gửi được bình luận', message: error instanceof Error ? error.message : 'Vui lòng thử lại.' });
    } finally {
      setSubmitting(false);
    }
  };

  const removeCommentFromList = (commentId: string) => {
    setComments((current) => current.filter((item) => item.id !== commentId && item.parentCommentId !== commentId));
    if (replyTarget === commentId) setReplyTarget(null);
  };

  const setHiddenState = (commentId: string, isDeleted: boolean) => {
    setComments((current) => current.map((item) => (
      item.id === commentId || item.parentCommentId === commentId
        ? { ...item, isDeleted }
        : item
    )));
    if (isDeleted && replyTarget === commentId) setReplyTarget(null);
  };

  const hideComment = async (comment: NewsComment) => {
    if (!accessToken || submitting || comment.isDeleted || !window.confirm('Ẩn bình luận này với độc giả? Bạn có thể hiện lại sau.')) return;
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/news/${encodeURIComponent(articleId)}/comments/${comment.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const result = await parseApiResponse<ApiEnvelope<unknown>>(response);
        throw new Error(result?.error || 'Chưa ẩn được bình luận.');
      }
      setHiddenState(comment.id, true);
      showToast({ type: 'success', title: 'Đã ẩn bình luận', message: 'Độc giả không còn thấy; bạn vẫn xem và có thể hiện lại.' });
    } catch (error) {
      showToast({ type: 'error', title: 'Không thể ẩn bình luận', message: error instanceof Error ? error.message : 'Vui lòng thử lại.' });
    } finally {
      setSubmitting(false);
    }
  };

  const restoreComment = async (comment: NewsComment) => {
    if (!accessToken || submitting || !comment.isDeleted) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/news/${encodeURIComponent(articleId)}/comments/${comment.id}/restore`,
        { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) {
        const result = await parseApiResponse<ApiEnvelope<unknown>>(response);
        throw new Error(result?.error || 'Chưa hiện lại được bình luận.');
      }
      setHiddenState(comment.id, false);
      showToast({ type: 'success', title: 'Đã hiện lại bình luận', message: 'Độc giả có thể nhìn thấy bình luận này trở lại.' });
    } catch (error) {
      showToast({ type: 'error', title: 'Không thể hiện lại', message: error instanceof Error ? error.message : 'Vui lòng thử lại.' });
    } finally {
      setSubmitting(false);
    }
  };

  const permanentlyDeleteComment = async (comment: NewsComment) => {
    if (!accessToken || submitting || !window.confirm('Xóa vĩnh viễn bình luận này? Nội dung sẽ mất và không hiện lại được.')) return;
    setSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/news/${encodeURIComponent(articleId)}/comments/${comment.id}/permanent`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) {
        const result = await parseApiResponse<ApiEnvelope<unknown>>(response);
        throw new Error(result?.error || 'Chưa xóa được bình luận.');
      }
      removeCommentFromList(comment.id);
      showToast({ type: 'success', title: 'Đã xóa bình luận', message: 'Bình luận và nội dung đã bị gỡ khỏi hệ thống.' });
    } catch (error) {
      showToast({ type: 'error', title: 'Không thể xóa bình luận', message: error instanceof Error ? error.message : 'Vui lòng thử lại.' });
    } finally {
      setSubmitting(false);
    }
  };

  const shareArticle = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast({ type: 'error', title: 'Không sao chép được liên kết', message: 'Hãy sao chép địa chỉ trang trên trình duyệt.' });
    }
  };

  const renderComment = (comment: NewsComment, isReply = false): ReactNode => (
    <article className={`news-comment${isReply ? ' news-comment--reply' : ''}${comment.isDeleted ? ' is-hidden' : ''}`} key={comment.id}>
      <div className="news-comment-avatar">
        {comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt="" /> : <UserRound size={18} />}
      </div>
      <div className="news-comment-main">
        <div className="news-comment-heading">
          <div className="news-comment-author">
            <strong>{comment.authorName}</strong>
            {comment.authorRole === 'Librarian' && <span className="news-librarian-badge">Thủ thư</span>}
            {comment.authorRole === 'Admin' && <span className="news-librarian-badge">Quản trị</span>}
            {comment.isDeleted && canModerate && <span className="news-comment-hidden-badge">Đã ẩn với độc giả</span>}
            <time>{formatDate(comment.createdAt)}</time>
          </div>
          {canModerate && (
            <div className="news-comment-actions">
              {comment.isDeleted ? (
                <button type="button" title="Hiện lại bình luận" aria-label="Hiện lại bình luận" onClick={() => void restoreComment(comment)}>
                  <Eye size={15} />
                </button>
              ) : (
                <button type="button" title="Ẩn bình luận" aria-label="Ẩn bình luận" onClick={() => void hideComment(comment)}>
                  <EyeOff size={15} />
                </button>
              )}
              <button type="button" title="Xóa bình luận" aria-label="Xóa bình luận" onClick={() => void permanentlyDeleteComment(comment)}>
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>
        <p className="news-comment-content">
          {comment.content
            || (canModerate && comment.isDeleted
              ? 'Nội dung đã mất do lần ẩn trước (không khôi phục được). Bình luận ẩn mới sẽ vẫn giữ nội dung.'
              : '')}
        </p>
        {canModerate && !isReply && !comment.isDeleted && (
          <button type="button" className="news-comment-reply-trigger" onClick={() => { setReplyTarget(replyTarget === comment.id ? null : comment.id); setReplyDraft(''); }}><MessageCircle size={14} /> Trả lời độc giả</button>
        )}
        {replyTarget === comment.id && (
          <form className="news-comment-form news-comment-form--reply" onSubmit={(event) => void postComment(event, comment.id)}>
            <label htmlFor={`news-reply-${comment.id}`}>Phản hồi với vai trò Thủ thư</label>
            <textarea id={`news-reply-${comment.id}`} maxLength={2000} value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} placeholder="Nhập nội dung phản hồi..." />
            <div className="news-comment-form-footer"><span>{replyDraft.length}/2000</span><button type="submit" className="news-comment-primary" disabled={!replyDraft.trim() || submitting}><Send size={15} /> Gửi phản hồi</button></div>
          </form>
        )}
        {replies.filter((reply) => reply.parentCommentId === comment.id).map((reply) => renderComment(reply, true))}
      </div>
    </article>
  );

  return (
    <div className={`annual-home annual-info-page news-detail-page${librarianMode ? ' news-detail-page--librarian' : ''}`}>
      {!librarianMode && <HomeNavbar activeSection="news" />}
      <main className="news-detail-main">
        <button type="button" className="news-detail-back" onClick={() => navigate(librarianMode ? '/librarian/news' : '/news')}><ArrowLeft size={17} /> Quay lại tin tức</button>
        {loadingArticle ? (
          <div className="news-detail-state" role="status">Đang tải bài viết...</div>
        ) : !article ? (
          <section className="news-detail-state news-detail-state--error"><strong>Không tìm thấy bài viết</strong><p>Bài viết có thể đã bị gỡ hoặc liên kết không còn hiệu lực.</p><Link to="/news">Trở về danh sách tin tức</Link></section>
        ) : (
          <>
            <article className="news-detail-article">
              <div className="news-detail-cover">
                {article.imageUrl ? <img src={article.imageUrl} alt={article.title} /> : <div className="news-detail-cover-fallback"><MessageCircle size={42} /></div>}
                <div className="news-detail-cover-shade" />
                <div className="news-detail-cover-tags"><span>{article.category}</span>{article.isPinned && <span className="is-pinned"><Pin size={13} /> Tin nổi bật</span>}</div>
              </div>
              <div className="news-detail-article-inner">
                <div className="news-detail-eyebrow">TIN TỨC THƯ VIỆN <span>·</span> {article.category.toLocaleUpperCase('vi-VN')}</div>
                <h1>{article.title}</h1>
                <div className="news-detail-meta">
                  <span><CalendarDays size={15} /> {formatDate(article.createdAt)}</span>
                  <span><UserRound size={15} /> {article.authorName}</span>
                  <span><Clock3 size={15} /> {readTime(article)}</span>
                </div>
                {article.summary && <p className="news-detail-summary">{article.summary}</p>}
                <div className="news-detail-content">
                  {(article.content || article.summary).split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
                <div className="news-detail-author">
                  <span className="news-detail-author-avatar"><UserRound size={20} /></span>
                  <div><small>Bài viết từ</small><strong>{article.authorName}</strong></div>
                  <button type="button" className="news-detail-share" onClick={() => void shareArticle()}>{copied ? <Check size={16} /> : <Share2 size={16} />}{copied ? 'Đã sao chép' : 'Chia sẻ bài viết'}</button>
                </div>
              </div>
            </article>

            <section className="news-comments-section" aria-labelledby="news-comments-title">
              <header className="news-comments-heading">
                <div><span className="news-comments-kicker">CÙNG TRAO ĐỔI</span><h2 id="news-comments-title">Bình luận</h2><p>Chia sẻ ý kiến hoặc đặt câu hỏi về thông tin trong bài viết.</p></div>
                <span className="news-comments-count"><MessageCircle size={16} /> {listedComments.length}</span>
              </header>
              {canComment ? (
                <form className="news-comment-form" onSubmit={(event) => void postComment(event)}>
                  <label htmlFor="news-comment-draft">{canModerate ? 'Chia sẻ thông tin từ thư viện' : 'Viết bình luận'}</label>
                  <textarea id="news-comment-draft" maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={canModerate ? 'Nhập thông tin hoặc phản hồi từ thư viện...' : 'Hãy giữ trao đổi lịch sự và liên quan đến bài viết...'} />
                  <div className="news-comment-form-footer"><span>{draft.length}/2000</span><button type="submit" className="news-comment-primary" disabled={!draft.trim() || submitting}><Send size={16} /> Đăng bình luận</button></div>
                </form>
              ) : <div className="news-comment-signin"><span>Đăng nhập để tham gia trao đổi về bài viết.</span><Link to="/login">Đăng nhập</Link></div>}

              {commentsError && <div className="news-comments-error" role="alert">{commentsError}<button type="button" onClick={() => void loadComments()}>Thử lại</button></div>}
              {loadingComments ? <div className="news-comments-state">Đang tải bình luận...</div>
                : topLevelComments.length === 0 ? <div className="news-comments-empty"><MessageCircle size={24} /><strong>Chưa có bình luận</strong><span>Hãy là người đầu tiên chia sẻ suy nghĩ của bạn.</span></div>
                  : <div className="news-comments-list">{topLevelComments.map((comment) => renderComment(comment))}</div>}
            </section>
          </>
        )}
      </main>
      {!librarianMode && <HomeFooter />}
    </div>
  );
};

export default NewsArticleDetailPage;
