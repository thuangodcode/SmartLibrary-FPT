import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUp, BookOpen, CircleHelp, LibraryBig, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import {
  askRag,
  getReaderAiSuggestedQuestions,
  type RagAskResult,
} from '../../ai/aiApi';
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

const TOPICS = [
  { id: 'books', label: 'Thông tin & tìm sách', description: 'Tìm theo tên, tác giả, chủ đề, ngôn ngữ', icon: BookOpen, questions: ['Tìm sách tiếng Hàn cho người mới bắt đầu', 'Có sách nào về trí tuệ nhân tạo không?'] },
  { id: 'borrowing', label: 'Mượn, trả & gia hạn', description: 'Cách mượn sách, thời hạn, gia hạn và trả sách', icon: LibraryBig, questions: DEFAULT_QUESTIONS.slice(0, 3) },
  { id: 'fees', label: 'Phí phạt & bồi thường', description: 'Phí quá hạn, sách hỏng hoặc bị mất', icon: CircleHelp, questions: [DEFAULT_QUESTIONS[3], 'Tôi cần làm gì nếu làm mất hoặc hư hỏng sách?'] },
  { id: 'account', label: 'Tài khoản & thẻ thư viện', description: 'Đăng ký, tài khoản và quyền sử dụng thư viện', icon: CircleHelp, questions: ['Làm thế nào để đăng ký thẻ thư viện?', 'Tôi cần làm gì nếu quên thông tin tài khoản?'] },
  { id: 'services', label: 'Dịch vụ & tiện ích', description: 'Tra cứu, đặt trước và các dịch vụ khác', icon: LibraryBig, questions: ['Làm sao để đặt trước một cuốn sách đang được mượn?', 'Thư viện có những dịch vụ nào?'] },
  { id: 'general', label: 'Câu hỏi chung', description: 'Thông tin thư viện hoặc chủ đề khác', icon: Sparkles, questions: DEFAULT_QUESTIONS },
];

type ChatTopic = typeof TOPICS[number];

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
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [question, setQuestion] = useState(searchParams.get('q') ?? '');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_QUESTIONS);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<ChatTopic | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [prefilledQuestion, setPrefilledQuestion] = useState(searchParams.get('q') ?? '');
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

  const startSession = (initialQuestion?: string) => {
    if (!selectedTopic) return;
    setTurns([]);
    const firstQuestion = initialQuestion ?? prefilledQuestion;
    setQuestion(firstQuestion);
    setPrefilledQuestion('');
    setSessionActive(true);
    if (firstQuestion.trim().length >= 3) void runAsk(firstQuestion);
    else window.setTimeout(() => questionRef.current?.focus(), 0);
  };

  const endSession = () => {
    setSessionActive(false);
    setSelectedTopic(null);
    setQuestion('');
  };

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
    const topicScope = selectedTopic
      ? `Phạm vi phiên: ${selectedTopic.label}. Ưu tiên trả lời trong phạm vi này. Nếu câu hỏi nằm ngoài phạm vi, hãy trả lời ngắn gọn và hướng người đọc sang chủ đề phù hợp.`
      : '';
    const recentContext = previousTurns
      .filter((turn) => turn.result)
      .slice(-4)
      .map((turn) => `Độc giả: ${turn.question}\nTrợ lý: ${turn.result?.answer}`)
      .join('\n\n');
    const conversationContext = [topicScope, recentContext].filter(Boolean).join('\n\n');
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
              {!sessionActive ? (
                <div className="rag-session-setup">
                  <div className="rag-session-intro">
                    <span className="rag-ask-welcome-mark"><Sparkles size={17} /></span>
                    <div><strong>Hôm nay bạn muốn tìm hiểu điều gì?</strong><p>Chọn một chủ đề để trợ lý tập trung vào đúng thông tin bạn cần.</p></div>
                  </div>
                  <div className="rag-topic-grid" role="radiogroup" aria-label="Chủ đề trò chuyện">
                    {TOPICS.map((topic) => {
                      const TopicIcon = topic.icon;
                      return <button type="button" role="radio" aria-checked={selectedTopic?.id === topic.id} className={`rag-topic-option${selectedTopic?.id === topic.id ? ' is-selected' : ''}`} key={topic.id} onClick={() => setSelectedTopic(topic)}>
                        <span><TopicIcon size={17} /></span><strong>{topic.label}</strong><small>{topic.description}</small>
                      </button>;
                    })}
                  </div>
                  <div className="rag-setup-suggestions">
                    <strong>Câu hỏi gợi ý</strong>
                    <div>{(selectedTopic?.questions ?? suggestions.slice(0, 4)).map((item) => <button type="button" key={item} onClick={() => { if (selectedTopic) startSession(item); }}>{item}</button>)}</div>
                    {loadingSuggestions && <small>Đang cập nhật câu hỏi…</small>}
                  </div>
                  <button type="button" className="rag-session-start" disabled={!selectedTopic} onClick={() => startSession(prefilledQuestion || undefined)}>Bắt đầu trò chuyện <ArrowUp size={16} /></button>
                </div>
              ) : (
              <>
              <div className="rag-session-bar"><span>Chủ đề: <strong>{selectedTopic?.label}</strong></span><button type="button" onClick={endSession}>Kết thúc trò chuyện</button></div>
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
                                {bookSources.slice(0, 4).map((source) => (
                                  <Link className="rag-ask-book-result" key={`${source.sourceType}-${source.sourceId}`} to={`/books/${source.sourceId}`}>
                                    <span className="rag-ask-book-cover">
                                      {source.coverImageUrl ? <img src={source.coverImageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">📖</span>}
                                    </span>
                                    <span className="rag-ask-book-copy">
                                      <strong>{source.title}</strong>
                                      <small>{source.author || 'Tác giả chưa cập nhật'}</small>
                                      <small>{source.availableCopies ?? 0} bản có thể mượn</small>
                                    </span>
                                  </Link>
                                ))}
                              </div>
                              {bookSources.length > 4 && <small className="rag-ask-more-results">Còn {bookSources.length - 4} đầu sách phù hợp khác.</small>}
                            </>
                          )}
                          {policySources.length > 0 && <div className="rag-policy-source">Theo chính sách: {policySources[0].title}</div>}
                          {turn.result.sources.length === 0 && <p className="rag-chat-no-source">Câu trả lời dựa trên dữ liệu thư viện hiện có.</p>}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              {selectedTopic && selectedTopic.questions.length > 0 && (
                <div className="rag-ask-suggestions">
                  <span>Câu hỏi gợi ý</span>
                  <div>
                    {selectedTopic.questions.slice(0, 4).map((item) => (
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
            </>
          )}
        </section>
      </div>}
    </>
  );
};

export default RagAskPanel;
