import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUp, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { askRag, type RagAskResult } from '../../ai/aiApi';
import { toBookFromRag } from '../utils/toBookCardData';
import { BookCard } from './BookCard';
import robotLogo from '../../../assets/figma/friendly-humanoid-ai-robot.jpg';
import './RagAskPanel.css';

function friendlyAskError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (/chưa cấu hình api key|hệ thống ai đang tắt|độc giả đang tắt/i.test(message)) {
    return message;
  }
  if (/no longer available|notfound|is not found|not supported/i.test(message)) {
    return 'Model AI của thư viện đang được cập nhật. Thử lại sau hoặc liên hệ Admin.';
  }
  if (/http 404/i.test(message)) {
    return 'Không gọi được dịch vụ tìm kiếm AI (HTTP 404). Thử lại hoặc liên hệ Admin.';
  }
  if (!message || message.length > 180) return 'Không hỏi được trợ lý AI. Thử lại sau.';
  return message;
}

const RagAskPanel = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [question, setQuestion] = useState(searchParams.get('q') ?? '');
  const [result, setResult] = useState<RagAskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    questionRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const runAsk = async () => {
    if (!accessToken || !question.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await askRag(accessToken, question.trim()));
    } catch (askError) {
      const message = askError instanceof Error ? askError.message : '';
      const retry = /second operation|failed to fetch|network|http 400|thử lại sau/i.test(message)
        || message.length > 180;
      if (retry) {
        try {
          setResult(await askRag(accessToken, question.trim()));
          return;
        } catch (retryError) {
          setResult(null);
          setError(friendlyAskError(retryError));
          return;
        }
      }
      setResult(null);
      setError(friendlyAskError(askError));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAsk();
  };

  const bookSources = (result?.sources ?? []).filter((source) => source.sourceType === 'book');
  const policySources = (result?.sources ?? []).filter((source) => source.sourceType !== 'book');
  const empty = Boolean(result && result.sources.length === 0 && !loading);

  return (
    <>
      <button type="button" className="rag-ask-launcher" onClick={() => setIsOpen(true)} aria-label="Mở trợ lý AI thư viện" title="Hỏi trợ lý AI">
        <img src={robotLogo} alt="" aria-hidden="true" />
      </button>
      {isOpen && <div className="rag-ask-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}>
      <section className="rag-ask" aria-label="Hỏi trợ lý thư viện" role="dialog" aria-modal="true" aria-labelledby="rag-ask-title">
      <div className="rag-ask-heading">
        <span className="rag-ask-heading-icon"><Sparkles size={16} /></span>
        <div><strong id="rag-ask-title">Tìm sách & hỏi chính sách bằng AI</strong><small>Trợ lý thư viện SmartLibrary</small></div>
        <button type="button" className="rag-ask-close" onClick={() => setIsOpen(false)} aria-label="Đóng trợ lý AI"><X size={18}/></button>
      </div>
      {!isAuthenticated || !accessToken ? (
        <p className="rag-ask-hint rag-ask-login">Đăng nhập để trò chuyện với trợ lý thư viện. <Link to="/login">Đăng nhập</Link></p>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <div className="rag-prompt-composer">
          <textarea
            ref={questionRef}
            rows={3}
            value={question}
            maxLength={4000}
            placeholder="Hỏi về sách, cách tìm tài liệu hoặc chính sách thư viện..."
            onChange={(event) => setQuestion(event.target.value)}
          />
          <div className="rag-prompt-controls">
            <span className="rag-ask-count">{question.length}/4000</span>
            <button type="submit" aria-label="Gửi câu hỏi" disabled={loading || question.trim().length < 3}>
              {loading ? <LoaderCircle size={17} className="ai-spin" /> : <ArrowUp size={17} />}
            </button>
          </div>
          </div>
        </form>
      )}
      {loading && (
        <p className="rag-ask-hint" aria-live="polite">Đang tìm sách trong thư viện…</p>
      )}
      {error && (
        <div className="rag-ask-error" role="alert">
          <p>{error}</p>
          {isAuthenticated && accessToken && (
            <button type="button" className="rag-ask-retry" onClick={() => void runAsk()} disabled={loading}>
              <RotateCcw size={14} /> Thử lại
            </button>
          )}
        </div>
      )}
      {empty && (
        <div className="rag-ask-empty" role="status">
          <h3>Chưa tìm thấy sách phù hợp</h3>
          <p>{result?.answer || 'Thư viện chưa có đầu sách khớp câu hỏi này. Thử đổi từ khóa hoặc nêu chuyên ngành cụ thể.'}</p>
        </div>
      )}
      {result && bookSources.length > 0 && (
        <div className="rag-ask-result">
          <div className="rag-ask-stats" aria-label="Thống kê sách tìm được">
            <div>
              <strong>{bookSources.length}</strong>
              <span>đầu sách phù hợp</span>
            </div>
            <div>
              <strong>{bookSources.filter((source) => (source.availableCopies ?? 0) > 0).length}</strong>
              <span>đầu sách còn bản</span>
            </div>
            <div>
              <strong>{bookSources.reduce((total, source) => total + (source.availableCopies ?? 0), 0)}</strong>
              <span>bản có thể mượn</span>
            </div>
          </div>
          <p>{result.answer}</p>
          <div className="rag-ask-grid">
            {bookSources.map((source) => (
              <BookCard
                key={`${source.sourceType}-${source.sourceId}`}
                book={toBookFromRag(source)}
                onSelect={(book) => navigate(`/books/${book.id}`)}
              />
            ))}
          </div>
          {policySources.length > 0 && (
            <ul>
              {policySources.map((source) => (
                <li key={`${source.sourceType}-${source.sourceId}`}>Chính sách: {source.title}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result && bookSources.length === 0 && policySources.length > 0 && (
        <div className="rag-ask-result">
          <p>{result.answer}</p>
          <ul>
            {policySources.map((source) => (
              <li key={`${source.sourceType}-${source.sourceId}`}>Chính sách: {source.title}</li>
            ))}
          </ul>
        </div>
      )}
      </section>
      </div>}
    </>
  );
};

export default RagAskPanel;
