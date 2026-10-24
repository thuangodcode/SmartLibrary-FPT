import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { askRag, type RagAskResult } from '../../ai/aiApi';
import { toBookFromRag } from '../utils/toBookCardData';
import { BookCard } from './BookCard';
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

  const runAsk = async () => {
    if (!accessToken || !question.trim()) return;
    setLoading(true);
    setError(null);
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
  const empty = Boolean(result && bookSources.length === 0 && !loading);

  return (
    <section className="rag-ask" aria-label="Hỏi trợ lý thư viện">
      <div className="rag-ask-heading">
        <Sparkles size={16} />
        <strong>Hỏi AI về sách và chính sách</strong>
      </div>
      {!isAuthenticated || !accessToken ? (
        <p className="rag-ask-hint">
          Đăng nhập tài khoản độc giả để gửi câu hỏi. Trợ lý chỉ trả lời từ sách thật trong thư viện.
          {' '}<Link to="/login">Đăng nhập</Link>
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <p className="rag-ask-hint">
            Viết thoải mái nhu cầu học, môn, kỳ, hoặc vì sao bạn cần sách. Không cần tóm tắt thành vài từ khóa.
          </p>
          <textarea
            rows={6}
            value={question}
            maxLength={4000}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <div className="rag-ask-actions">
            <button type="submit" disabled={loading || question.trim().length < 3}>
              {loading ? <LoaderCircle size={14} className="ai-spin" /> : <Sparkles size={14} />}
              {loading ? 'Đang tìm…' : 'Hỏi AI'}
            </button>
            <span className="rag-ask-count">{question.length}/4000</span>
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
    </section>
  );
};

export default RagAskPanel;
