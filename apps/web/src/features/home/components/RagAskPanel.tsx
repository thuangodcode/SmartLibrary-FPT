import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUp, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import {
  askRag,
  getReaderAiSuggestedQuestions,
  type RagAskResult,
} from '../../ai/aiApi';
import { toBookFromRag } from '../utils/toBookCardData';
import { BookCard } from './BookCard';
import robotLogo from '../../../assets/figma/friendly-humanoid-ai-robot.jpg';
import talkingRobotLogo from '../../../assets/figma/thumb-robot-noi-chuyen-pika-robot-ai.png';
import './RagAskPanel.css';

interface ConversationTurn {
  id: number;
  question: string;
  result?: RagAskResult;
  error?: string;
  loading?: boolean;
}

const DEFAULT_QUESTIONS = [
  'Tôi có thể mượn tối đa bao nhiêu cuốn sách?',
  'Thời hạn mượn sách là bao lâu và có thể gia hạn không?',
  'Làm thế nào để mượn sách tại thư viện?',
  'Mượn sách có mất phí không? Phí quá hạn được tính thế nào?',
];

function friendlyAskError(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (/chưa cấu hình api key|hệ thống ai đang tắt|độc giả đang tắt/i.test(message)) return message;
  if (/no longer available|notfound|is not found|not supported/i.test(message)) {
    return 'Model AI của thư viện đang được cập nhật. Thử lại sau hoặc liên hệ Admin.';
  }
  if (/http 404/i.test(message)) return 'Không gọi được dịch vụ AI. Thử lại hoặc liên hệ Admin.';
  if (!message || message.length > 180) return 'Không hỏi được trợ lý AI. Thử lại sau.';
  return message;
}

const RagAskPanel = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [question, setQuestion] = useState(searchParams.get('q') ?? '');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_QUESTIONS);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const nextIdRef = useRef(0);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const sending = turns.some((turn) => turn.loading);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    questionRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !accessToken) return undefined;
    let cancelled = false;
    setLoadingSuggestions(true);
    void getReaderAiSuggestedQuestions(accessToken)
      .then((items) => { if (!cancelled) setSuggestions(items); })
      .catch(() => { if (!cancelled) setSuggestions(DEFAULT_QUESTIONS); })
      .finally(() => { if (!cancelled) setLoadingSuggestions(false); });
    return () => { cancelled = true; };
  }, [isOpen, accessToken]);

  useEffect(() => {
    if (!isOpen) return;
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTo({ top: conversation.scrollHeight, behavior: 'smooth' });
  }, [isOpen, turns]);

  const runAsk = async (prompt: string, retryId?: number) => {
    if (!accessToken || !prompt.trim() || sending) return;
    const id = retryId ?? ++nextIdRef.current;
    const previousTurns = retryId
      ? turns.filter((turn) => turn.id !== retryId)
      : turns;
    const conversationContext = previousTurns
      .filter((turn) => turn.result)
      .slice(-4)
      .map((turn) => `Độc giả: ${turn.question}\nTrợ lý: ${turn.result?.answer}`)
      .join('\n\n');
    setTurns((current) => retryId
      ? current.map((turn) => turn.id === retryId ? { ...turn, loading: true, error: undefined } : turn)
      : [...current, { id, question: prompt.trim(), loading: true }]);

    try {
      const result = await askRag(accessToken, prompt.trim(), conversationContext);
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, result, loading: false } : turn));
    } catch (askError) {
      const message = askError instanceof Error ? askError.message : '';
      const shouldRetry = /second operation|failed to fetch|network|http 400|thử lại sau/i.test(message)
        || message.length > 180;
      if (shouldRetry) {
        try {
          const result = await askRag(accessToken, prompt.trim(), conversationContext);
          setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, result, loading: false } : turn));
          return;
        } catch (retryError) {
          setTurns((current) => current.map((turn) => turn.id === id
            ? { ...turn, loading: false, error: friendlyAskError(retryError) }
            : turn));
          return;
        }
      }
      setTurns((current) => current.map((turn) => turn.id === id
        ? { ...turn, loading: false, error: friendlyAskError(askError) }
        : turn));
    }
  };

  const submitQuestion = (prompt: string) => {
    if (prompt.trim().length < 3 || sending) return;
    setQuestion('');
    void runAsk(prompt);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    submitQuestion(question);
  };

  return (
    <>
      <button type="button" className="rag-ask-launcher" onClick={() => setIsOpen(true)} aria-label="Mở trợ lý AI thư viện" title="Hỏi trợ lý AI">
        <img src={robotLogo} alt="" aria-hidden="true" />
      </button>
      {isOpen && <div className="rag-ask-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}>
        <section className="rag-ask" aria-label="Hỏi trợ lý thư viện" role="dialog" aria-modal="true" aria-labelledby="rag-ask-title">
          <div className="rag-ask-heading">
            <span className="rag-ask-heading-icon"><img src={talkingRobotLogo} alt="" /></span>
            <div><strong id="rag-ask-title">Trò chuyện với trợ lý thư viện</strong><small>Hỏi về sách, dịch vụ và chính sách thư viện</small></div>
            <button type="button" className="rag-ask-close" onClick={() => setIsOpen(false)} aria-label="Đóng trợ lý AI"><X size={18} /></button>
          </div>
          {!isAuthenticated || !accessToken ? (
            <p className="rag-ask-hint rag-ask-login">Đăng nhập để trò chuyện với trợ lý thư viện. <Link to="/login">Đăng nhập</Link></p>
          ) : (
            <>
              <div className="rag-ask-conversation" ref={conversationRef} aria-live="polite">
                {turns.length === 0 && (
                  <div className="rag-ask-welcome">
                    <span className="rag-ask-welcome-mark"><Sparkles size={17} /></span>
                    <div><strong>Xin chào! Tôi có thể giúp gì cho bạn?</strong><p>Chọn một câu hỏi gợi ý hoặc nhập nội dung bên dưới.</p></div>
                  </div>
                )}
                {turns.map((turn) => {
                  const bookSources = (turn.result?.sources ?? []).filter((source) => source.sourceType === 'book');
                  const policySources = (turn.result?.sources ?? []).filter((source) => source.sourceType !== 'book');
                  return (
                    <article className="rag-chat-turn" key={turn.id}>
                      <div className="rag-chat-user-message">{turn.question}</div>
                      {turn.loading && <div className="rag-chat-assistant-message is-loading"><LoaderCircle size={15} className="ai-spin" /> Đang tra cứu thông tin phù hợp…</div>}
                      {turn.error && (
                        <div className="rag-chat-assistant-message is-error">
                          <p>{turn.error}</p>
                          <button type="button" className="rag-ask-retry" onClick={() => void runAsk(turn.question, turn.id)} disabled={sending}>
                            <RotateCcw size={14} /> Thử lại
                          </button>
                        </div>
                      )}
                      {turn.result && (
                        <div className="rag-chat-assistant-message">
                          <p>{turn.result.answer}</p>
                          {bookSources.length > 0 && (
                            <>
                              <div className="rag-ask-stats" aria-label="Thống kê sách tìm được">
                                <div><strong>{bookSources.length}</strong><span>đầu sách phù hợp</span></div>
                                <div><strong>{bookSources.filter((source) => (source.availableCopies ?? 0) > 0).length}</strong><span>đầu sách còn bản</span></div>
                                <div><strong>{bookSources.reduce((total, source) => total + (source.availableCopies ?? 0), 0)}</strong><span>bản có thể mượn</span></div>
                              </div>
                              <div className="rag-ask-grid">
                                {bookSources.map((source) => (
                                  <BookCard
                                    key={`${source.sourceType}-${source.sourceId}`}
                                    book={toBookFromRag(source)}
                                    onSelect={(book) => navigate(`/books/${book.id}`)}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                          {policySources.length > 0 && <ul>{policySources.map((source) => <li key={`${source.sourceType}-${source.sourceId}`}>Chính sách: {source.title}</li>)}</ul>}
                          {turn.result.sources.length === 0 && <p className="rag-chat-no-source">Câu trả lời dựa trên dữ liệu thư viện hiện có.</p>}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              {suggestions.length > 0 && (
                <div className="rag-ask-suggestions">
                  <span>Câu hỏi gợi ý</span>
                  <div>
                    {(turns.length === 0 ? suggestions : suggestions.slice(0, 4)).map((item) => (
                      <button type="button" key={item} disabled={sending} onClick={() => submitQuestion(item)}>{item}</button>
                    ))}
                    {loadingSuggestions && <small>Đang cập nhật…</small>}
                  </div>
                </div>
              )}
              <form onSubmit={submit}>
                <div className="rag-prompt-composer">
                  <textarea
                    ref={questionRef}
                    rows={2}
                    value={question}
                    maxLength={4000}
                    placeholder="Nhập câu hỏi tiếp theo…"
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        submitQuestion(question);
                      }
                    }}
                  />
                  <div className="rag-prompt-controls">
                    <span className="rag-ask-count">{question.length}/4000 · Enter để gửi</span>
                    <button type="submit" aria-label="Gửi câu hỏi" disabled={sending || question.trim().length < 3}>
                      {sending ? <LoaderCircle size={17} className="ai-spin" /> : <ArrowUp size={17} />}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </section>
      </div>}
    </>
  );
};

export default RagAskPanel;
