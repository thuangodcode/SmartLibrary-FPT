import { useEffect, useRef, useState, type FormEvent } from 'react';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { AlertCircle, Camera, Check, CircleHelp, LoaderCircle, MessageCircle, Send, UserRound, X } from 'lucide-react';
import HomeNavbar from '../../home/components/HomeNavbar';
import HomeFooter from '../../home/components/HomeFooter';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './SupportPage.css';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface RequestType {
  id: string;
  name: string;
}

interface ChatMessage {
  id: string;
  readerId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

interface ComplaintReply {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  message: string;
  createdAt: string;
}

interface Complaint {
  id: string;
  readerId: string;
  readerName: string;
  readerEmail: string;
  readerAvatarUrl: string | null;
  requestTypeId: string;
  requestType: string;
  content: string;
  attachmentUrl: string | null;
  status: string;
  createdAt: string;
  acceptedById: string | null;
  acceptedByName: string | null;
  acceptedAt: string | null;
  dueAt: string | null;
  firstRespondedAt: string | null;
  replies: ComplaintReply[];
}

type SupportTab = 'chat' | 'complaint';
type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messagesById.set(message.id, message));
  return [...messagesById.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

const statusLabel: Record<string, string> = {
  Pending: 'Đang chờ tiếp nhận',
  InProgress: 'Đang xử lý',
  Resolved: 'Đã phản hồi',
};

async function fetchData<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });
  const result = await parseApiResponse<ApiEnvelope<T>>(response);
  if (!response.ok || !result?.success || result.data === undefined) {
    throw new Error(result?.error || 'Không thể kết nối đến dịch vụ hỗ trợ.');
  }
  return result.data;
}

const SupportPage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const currentUser = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<SupportTab>('chat');
  const [types, setTypes] = useState<RequestType[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [draft, setDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [connection, setConnection] = useState<HubConnection | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  const [requestTypeId, setRequestTypeId] = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [complaintBusy, setComplaintBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedComplaint) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedComplaint(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [selectedComplaint]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const markChatRead = async () => {
      try {
        await fetchData<{ unreadCount: number }>('/api/v1/support/chat/read', token, { method: 'POST' });
        if (active) window.dispatchEvent(new Event('reader-support-read'));
      } catch {
        // Reading messages still works if the acknowledgement request is temporarily unavailable.
      }
    };
    const hub = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/support-chat`, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    hub.on('ReceiveChatMessage', (message: ChatMessage) => {
      if (!active) return;
      setMessages((current) => current.some((item) => item.id === message.id)
        ? current
        : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      if (message.senderRole !== 'Reader') void markChatRead();
    });
    hub.on('ComplaintReplied', (complaint: Complaint) => {
      if (!active) return;
      setComplaints((current) => current.map((item) => item.id === complaint.id ? complaint : item));
    });
    hub.on('ComplaintUpdated', (complaint: Complaint) => {
      if (!active) return;
      setComplaints((current) => current.map((item) => item.id === complaint.id ? complaint : item));
    });
    hub.onreconnecting(() => {
      if (active) setRealtimeStatus('reconnecting');
    });
    hub.onreconnected(async () => {
      if (!active) return;
      setRealtimeStatus('connected');
      try {
        const chatMessages = await fetchData<ChatMessage[]>('/api/v1/support/chat/messages', token);
        if (active) setMessages((current) => mergeMessages(current, chatMessages));
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Không thể đồng bộ tin nhắn sau khi kết nối lại.');
      }
    });
    hub.onclose(() => {
      if (active) setRealtimeStatus('disconnected');
    });

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [requestTypes, chatMessages, myComplaints] = await Promise.all([
          fetchData<RequestType[]>('/api/v1/support/request-types', token),
          fetchData<ChatMessage[]>('/api/v1/support/chat/messages', token),
          fetchData<Complaint[]>('/api/v1/support/complaints/mine', token),
        ]);
        if (!active) return;
        setTypes(requestTypes);
        setRequestTypeId((current) => current || requestTypes[0]?.id || '');
        setMessages((current) => mergeMessages(current, chatMessages));
        setComplaints(myComplaints);
        void markChatRead();
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Không thể tải trang hỗ trợ.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const startHub = async () => {
      try {
        await hub.start();
        if (!active) {
          await hub.stop();
          return;
        }
        setConnection(hub);
        setRealtimeStatus('connected');
      } catch (caught: unknown) {
        if (active) {
          setRealtimeStatus('disconnected');
          setError(caught instanceof Error ? `Không thể kết nối chat realtime: ${caught.message}` : 'Không thể kết nối chat realtime.');
        }
      }
    };
    void startHub();

    return () => {
      active = false;
      setRealtimeStatus('disconnected');
      setConnection(null);
      if (hub.state === HubConnectionState.Connected || hub.state === HubConnectionState.Reconnecting) {
        void hub.stop();
      }
    };
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, tab]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !connection || chatBusy) return;
    setChatBusy(true);
    setError(null);
    try {
      await connection.invoke('SendMessage', message);
      setDraft('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi tin nhắn.');
    } finally {
      setChatBusy(false);
    }
  };

  const sendComplaint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !requestTypeId) return;
    setComplaintBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set('RequestTypeId', requestTypeId);
      form.set('Content', complaintText.trim());
      if (attachment) form.set('Attachment', attachment);
      const created = await fetchData<Complaint>('/api/v1/support/complaints', token, {
        method: 'POST',
        body: form,
      });
      setComplaints((current) => [created, ...current]);
      setComplaintText('');
      setAttachment(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      setNotice('Đơn hỗ trợ đã được gửi đến thủ thư.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi đơn hỗ trợ.');
    } finally {
      setComplaintBusy(false);
    }
  };

  const selectAttachment = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAttachment(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      setError('Tệp bằng chứng phải là ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachment(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      setError('Ảnh bằng chứng không được vượt quá 10 MB.');
      return;
    }
    setError(null);
    setAttachment(file);
  };

  return (
    <div className="annual-home support-page">
      <HomeNavbar />
      <main className="support-main">
        <header className="support-heading">
          <p>SMARTLIBRARY · TRUNG TÂM HỖ TRỢ</p>
          <h1>Hỗ trợ độc giả</h1>
          <span>Nhắn tin trực tiếp hoặc gửi đơn để thủ thư hỗ trợ bạn.</span>
        </header>

        <div className="support-tabs" role="tablist" aria-label="Kênh hỗ trợ">
          <button className={tab === 'chat' ? 'is-active' : ''} onClick={() => setTab('chat')} role="tab" aria-selected={tab === 'chat'}>
            <MessageCircle size={17} /> Nhắn tin với thủ thư
          </button>
          <button className={tab === 'complaint' ? 'is-active' : ''} onClick={() => setTab('complaint')} role="tab" aria-selected={tab === 'complaint'}>
            <CircleHelp size={17} /> Gửi đơn hỗ trợ
          </button>
        </div>

        {error && <div className="support-alert support-alert--error" role="alert"><AlertCircle size={17} />{error}</div>}
        {notice && <div className="support-alert support-alert--success" role="status"><Check size={17} />{notice}</div>}

        {tab === 'chat' ? (
          <section className="support-chat-card">
            <header className="support-chat-header">
              <div className="support-chat-mark"><MessageCircle size={19} /></div>
              <div><strong>Trao đổi trực tiếp</strong><span>{
                realtimeStatus === 'connected' ? 'Đang kết nối realtime'
                  : realtimeStatus === 'reconnecting' ? 'Đang kết nối lại...'
                    : realtimeStatus === 'disconnected' ? 'Mất kết nối realtime'
                      : 'Đang kết nối...'
              }</span></div>
              <span className={`support-live-dot${realtimeStatus === 'connected' ? ' is-online' : realtimeStatus === 'reconnecting' ? ' is-reconnecting' : ''}`} />
            </header>
            <div className="support-chat-messages" aria-live="polite">
              {loading ? (
                <div className="support-chat-empty"><LoaderCircle className="support-spinner" size={21} />Đang tải tin nhắn...</div>
              ) : messages.length ? messages.map((message) => {
                const mine = message.senderId === currentUser?.id;
                return (
                  <article className={`support-chat-message${mine ? ' is-mine' : ''}`} key={message.id}>
                    {!mine && <div className="support-chat-avatar"><UserRound size={16} /></div>}
                    <div className="support-chat-bubble">
                      {!mine && <strong>{message.senderName} · {message.senderRole === 'Librarian' ? 'Thủ thư' : 'Hỗ trợ'}</strong>}
                      <p>{message.message}</p>
                      <time>{dateTime(message.createdAt)}</time>
                    </div>
                  </article>
                );
              }) : (
                <div className="support-chat-empty">
                  <MessageCircle size={23} />
                  <span>Chào {currentUser?.fullName || 'bạn'}! Hãy gửi tin nhắn để bắt đầu trao đổi với thủ thư.</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <form className="support-chat-composer" onSubmit={(event) => void sendMessage(event)}>
              <label className="sr-only" htmlFor="support-chat-draft">Tin nhắn</label>
              <input
                id="support-chat-draft"
                maxLength={2000}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Nhập tin nhắn của bạn..."
                value={draft}
              />
              <button type="submit" disabled={!draft.trim() || !connection || realtimeStatus !== 'connected' || chatBusy} aria-label="Gửi tin nhắn">
                {chatBusy ? <LoaderCircle className="support-spinner" size={17} /> : <Send size={17} />}
                <span>Gửi</span>
              </button>
            </form>
          </section>
        ) : (
          <div className="support-complaint-layout">
            <section className="support-complaint-list">
              <header><div><span className="support-section-eyebrow">THEO DÕI YÊU CẦU</span><h2>Đơn của tôi</h2></div><span>{complaints.length}</span></header>
              {loading ? <div className="support-chat-empty"><LoaderCircle className="support-spinner" size={21} />Đang tải đơn...</div> :
                complaints.length ? complaints.map((complaint) => (
                  <article className="support-ticket" key={complaint.id}>
                    <div className="support-ticket-top"><strong>{complaint.requestType}</strong><span className={`support-ticket-status support-ticket-status--${complaint.status.toLowerCase()}`}>{statusLabel[complaint.status] ?? complaint.status}</span></div>
                    <p>{complaint.content}</p>
                    <footer><time>{dateTime(complaint.createdAt)}</time><span>{complaint.replies.length} phản hồi</span><button type="button" onClick={() => setSelectedComplaint(complaint)}>Xem chi tiết</button></footer>
                  </article>
                )) : <div className="support-chat-empty"><CircleHelp size={22} />Bạn chưa gửi đơn hỗ trợ nào.</div>}
            </section>

            <form className="support-complaint-form" onSubmit={(event) => void sendComplaint(event)}>
              <header><span className="support-form-icon"><CircleHelp size={19} /></span><div><h2>Gửi đơn hỗ trợ</h2><p>Đơn sẽ được chuyển đến bộ phận thư viện.</p></div></header>
              <label>
                Loại đơn
                <select required value={requestTypeId} onChange={(event) => setRequestTypeId(event.target.value)}>
                  {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </label>
              {!loading && types.length === 0 && <p className="support-inline-error">Hiện chưa có loại đơn nào được mở tiếp nhận.</p>}
              <label>
                Nội dung đơn
                <textarea
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={7}
                  placeholder="Mô tả chi tiết nội dung bạn cần hỗ trợ (tối thiểu 10 ký tự)..."
                  value={complaintText}
                  onChange={(event) => setComplaintText(event.target.value)}
                />
                <small>{complaintText.length}/5000 ký tự</small>
              </label>
              <label className="support-attachment-control">
                <span><Camera size={17} /> {attachment ? attachment.name : 'Ảnh bằng chứng (nếu có)'}</span>
                <input ref={attachmentInputRef} accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => selectAttachment(event.currentTarget.files?.[0])} />
              </label>
              {attachment && <button className="support-attachment-remove" type="button" onClick={() => { setAttachment(null); if (attachmentInputRef.current) attachmentInputRef.current.value = ''; }}>Gỡ ảnh đính kèm</button>}
              <p className="support-form-hint">JPG, PNG hoặc WebP · tối đa 10 MB</p>
              <button className="support-submit" disabled={complaintBusy || !requestTypeId} type="submit">
                {complaintBusy ? <LoaderCircle className="support-spinner" size={17} /> : <Send size={17} />}
                Gửi đơn
              </button>
            </form>
          </div>
        )}
      </main>
      {selectedComplaint && <div className="support-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedComplaint(null); }}>
        <section className="support-detail-modal" role="dialog" aria-modal="true" aria-labelledby="support-detail-title">
          <header><div><span className="support-section-eyebrow">CHI TIẾT ĐƠN HỖ TRỢ</span><h2 id="support-detail-title">{selectedComplaint.requestType}</h2></div><button type="button" aria-label="Đóng chi tiết" onClick={() => setSelectedComplaint(null)}><X size={19} /></button></header>
          <div className="support-detail-meta"><span className={`support-ticket-status support-ticket-status--${selectedComplaint.status.toLowerCase()}`}>{statusLabel[selectedComplaint.status] ?? selectedComplaint.status}</span><time>Gửi lúc {dateTime(selectedComplaint.createdAt)}</time></div>
          <div className="support-detail-handling">
            <div><strong>Tiếp nhận</strong><span>{selectedComplaint.acceptedByName ? `${selectedComplaint.acceptedByName}${selectedComplaint.acceptedAt ? ` · ${dateTime(selectedComplaint.acceptedAt)}` : ''}` : 'Đang chờ thủ thư tiếp nhận'}</span></div>
            {selectedComplaint.dueAt && <div><strong>Hạn xử lý dự kiến</strong><span>{dateTime(selectedComplaint.dueAt)}</span></div>}
            {selectedComplaint.firstRespondedAt && <div><strong>Phản hồi lần đầu</strong><span>{dateTime(selectedComplaint.firstRespondedAt)}</span></div>}
          </div>
          <div className="support-detail-content">{selectedComplaint.content}</div>
          {selectedComplaint.attachmentUrl && <a className="support-detail-attachment" href={selectedComplaint.attachmentUrl} target="_blank" rel="noreferrer"><Camera size={16} /> Xem ảnh đính kèm</a>}
          <div className="support-detail-replies"><h3>Trao đổi ({selectedComplaint.replies.length})</h3>{selectedComplaint.replies.length ? selectedComplaint.replies.map((reply) => <article className="support-ticket-reply" key={reply.id}><strong>Phản hồi từ {reply.senderRole === 'Librarian' ? 'thủ thư' : reply.senderName}</strong><p>{reply.message}</p><time>{dateTime(reply.createdAt)}</time></article>) : <p>Chưa có phản hồi cho đơn này.</p>}</div>
          <footer><button type="button" onClick={() => setSelectedComplaint(null)}>Đóng</button></footer>
        </section>
      </div>}
      <HomeFooter />
    </div>
  );
};

export default SupportPage;
