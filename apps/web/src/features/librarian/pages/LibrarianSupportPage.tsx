import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { AlertCircle, CalendarClock, Check, CircleHelp, Image as ImageIcon, LoaderCircle, MessageCircle, Plus, Send, Settings2, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './LibrarianSupportPage.css';

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

interface Conversation {
  readerId: string;
  readerName: string;
  avatarUrl: string | null;
  studentId: string | null;
  lastMessage: ChatMessage;
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

type SupportView = 'requests' | 'replies';
type ResponseTab = 'complaints' | 'chat';

const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

const dateTimeLocalValue = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const complaintStatus: Record<string, string> = {
  Pending: 'Mới tiếp nhận',
  InProgress: 'Đang xử lý',
  Resolved: 'Đã phản hồi',
};

async function fetchData<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const result = await parseApiResponse<ApiEnvelope<T>>(response);
  if (!response.ok || !result?.success || result.data === undefined) {
    throw new Error(result?.error || 'Không thể tải thông tin hỗ trợ.');
  }
  return result.data;
}

const LibrarianSupportPage: React.FC<{ view: SupportView }> = ({ view }) => {
  const token = useAuthStore((state) => state.accessToken);
  const currentUser = useAuthStore((state) => state.user);
  const [types, setTypes] = useState<RequestType[]>([]);
  const [typeDraft, setTypeDraft] = useState('');
  const [typeSaving, setTypeSaving] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selectedComplaintId, setSelectedComplaintId] = useState('');
  const [responseTab, setResponseTab] = useState<ResponseTab>('complaints');
  const [replyDraft, setReplyDraft] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState('');
  const [complaintActionBusy, setComplaintActionBusy] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedReaderId, setSelectedReaderId] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [connection, setConnection] = useState<HubConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeReaderRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadTypes = useCallback(async () => {
    if (!token) return;
    const result = await fetchData<RequestType[]>('/api/v1/support/request-types', token);
    setTypes(result);
  }, [token]);

  const loadComplaints = useCallback(async () => {
    if (!token) return;
    const result = await fetchData<Complaint[]>('/api/v1/support/complaints', token);
    setComplaints(result);
    const visibleComplaints = view === 'replies' ? result.filter((item) => item.status !== 'Resolved') : result;
    setSelectedComplaintId((current) => visibleComplaints.some((item) => item.id === current)
      ? current
      : visibleComplaints[0]?.id ?? '');
    setScheduleDraft((current) => current || dateTimeLocalValue(visibleComplaints[0]?.dueAt ?? null));
  }, [token, view]);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    const result = await fetchData<Conversation[]>('/api/v1/support/chat/conversations', token);
    setConversations(result);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const hub = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/support-chat`, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    hub.on('ReceiveChatMessage', (message: ChatMessage) => {
      if (!active || message.readerId !== activeReaderRef.current) return;
      setChatMessages((current) => current.some((item) => item.id === message.id)
        ? current
        : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    });
    hub.on('ConversationUpdated', () => {
      if (active) void loadConversations().catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Không thể cập nhật danh sách trò chuyện.');
      });
    });
    hub.on('NewComplaint', (complaint: Complaint) => {
      if (active) setComplaints((current) => current.some((item) => item.id === complaint.id)
        ? current
        : [complaint, ...current]);
    });
    hub.on('ComplaintUpdated', (complaint: Complaint) => {
      if (active) setComplaints((current) => current.map((item) => item.id === complaint.id ? complaint : item));
    });
    hub.onreconnected(async () => {
      const readerId = activeReaderRef.current;
      if (readerId) await hub.invoke('JoinConversation', readerId);
    });

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadTypes(), loadComplaints(), loadConversations()]);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu hỗ trợ.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    void hub.start()
      .then(async () => {
        if (!active) return;
        setConnection(hub);
        const readerId = activeReaderRef.current;
        if (readerId) await hub.invoke('JoinConversation', readerId);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? `Không thể kết nối chat realtime: ${caught.message}` : 'Không thể kết nối chat realtime.');
      });
    return () => {
      active = false;
      activeReaderRef.current = '';
      setConnection(null);
      void hub.stop();
    };
  }, [token, loadTypes, loadComplaints, loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const openComplaints = useMemo(() => complaints.filter((item) => item.status !== 'Resolved'), [complaints]);
  const selectableComplaints = view === 'replies' ? openComplaints : complaints;
  const selectedComplaint = selectableComplaints.find((item) => item.id === selectedComplaintId)
    ?? selectableComplaints[0]
    ?? null;
  const pendingComplaints = openComplaints.filter((item) => !item.acceptedAt);

  const acceptComplaint = async (complaintId: string) => {
    if (!token || complaintActionBusy) return;
    setComplaintActionBusy(complaintId);
    setError(null);
    setNotice(null);
    try {
      const updated = await fetchData<Complaint>(`/api/v1/support/complaints/${complaintId}/accept`, token, { method: 'POST' });
      setComplaints((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (selectedComplaint?.id === updated.id) setScheduleDraft(dateTimeLocalValue(updated.dueAt));
      setNotice('Đơn đã được tiếp nhận và ghi nhận thời gian xử lý.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tiếp nhận đơn.');
    } finally {
      setComplaintActionBusy('');
    }
  };

  const saveComplaintSchedule = async (complaintId: string, clear = false) => {
    if (!token || complaintActionBusy) return;
    if (!clear && !scheduleDraft) {
      setError('Hãy chọn thời hạn xử lý.');
      return;
    }
    const scheduledDate = scheduleDraft ? new Date(scheduleDraft) : null;
    if (!clear && (!scheduledDate || Number.isNaN(scheduledDate.getTime()))) {
      setError('Thời hạn xử lý không hợp lệ.');
      return;
    }
    const dueAt = clear ? null : scheduledDate!.toISOString();
    if (dueAt && new Date(dueAt) <= new Date()) {
      setError('Hạn xử lý phải nằm trong tương lai.');
      return;
    }
    setComplaintActionBusy(complaintId);
    setError(null);
    setNotice(null);
    try {
      const updated = await fetchData<Complaint>(`/api/v1/support/complaints/${complaintId}/schedule`, token, {
        method: 'PUT',
        body: JSON.stringify({ dueAt }),
      });
      setComplaints((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (selectedComplaint?.id === updated.id) setScheduleDraft(dateTimeLocalValue(updated.dueAt));
      setNotice(clear ? 'Đã xóa hạn xử lý.' : 'Đã cập nhật hạn xử lý.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật hạn xử lý.');
    } finally {
      setComplaintActionBusy('');
    }
  };

  const saveRequestTypes = async () => {
    if (!token || typeSaving) return;
    const names = types.map((item) => item.name.trim()).filter(Boolean);
    if (typeDraft.trim()) names.push(typeDraft.trim());
    if (!names.length) {
      setError('Cần duy trì ít nhất một loại đơn.');
      return;
    }
    setTypeSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await fetchData<RequestType[]>('/api/v1/support/request-types', token, {
        method: 'PUT',
        body: JSON.stringify({ names }),
      });
      setTypes(saved);
      setTypeDraft('');
      setNotice('Danh sách loại đơn đã được cập nhật.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu loại đơn.');
    } finally {
      setTypeSaving(false);
    }
  };

  const removeRequestType = (id: string) => {
    setTypes((current) => current.filter((item) => item.id !== id));
  };

  const sendComplaintReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !selectedComplaint || !replyDraft.trim()) return;
    setReplyBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fetchData<ComplaintReply>(`/api/v1/support/complaints/${selectedComplaint.id}/replies`, token, {
        method: 'POST',
        body: JSON.stringify({ message: replyDraft.trim() }),
      });
      setReplyDraft('');
      await loadComplaints();
      setNotice('Phản hồi đã được gửi đến độc giả.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi phản hồi.');
    } finally {
      setReplyBusy(false);
    }
  };

  const openConversation = async (conversation: Conversation) => {
    if (!token) return;
    const previousReaderId = activeReaderRef.current;
    activeReaderRef.current = conversation.readerId;
    setSelectedReaderId(conversation.readerId);
    setChatMessages([]);
    setError(null);
    try {
      if (connection && previousReaderId && previousReaderId !== conversation.readerId) {
        await connection.invoke('LeaveConversation', previousReaderId);
      }
      if (connection) await connection.invoke('JoinConversation', conversation.readerId);
      const history = await fetchData<ChatMessage[]>(
        `/api/v1/support/chat/conversations/${conversation.readerId}/messages`,
        token,
      );
      if (activeReaderRef.current === conversation.readerId) {
        setChatMessages((current) => {
          const merged = new Map(history.map((message) => [message.id, message]));
          current.forEach((message) => merged.set(message.id, message));
          return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể mở cuộc trò chuyện.');
    }
  };

  const sendChatReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!connection || !selectedReaderId || !chatDraft.trim() || chatBusy) return;
    setChatBusy(true);
    setError(null);
    try {
      await connection.invoke('SendReply', selectedReaderId, chatDraft.trim());
      setChatDraft('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi tin nhắn.');
    } finally {
      setChatBusy(false);
    }
  };

  const renderComplaintWorkflow = (complaint: Complaint) => (
    <section className="librarian-support-workflow" aria-label="Tiếp nhận và thời hạn xử lý">
      <div className="librarian-support-workflow-summary">
        <strong>{complaint.acceptedByName ? 'Đã tiếp nhận' : 'Chưa tiếp nhận'}</strong>
        {complaint.acceptedByName ? (
          <span>{complaint.acceptedByName} · {complaint.acceptedAt ? dateTime(complaint.acceptedAt) : 'Đang cập nhật thời gian'}</span>
        ) : (
          <button
            type="button"
            disabled={complaintActionBusy === complaint.id || Boolean(complaintActionBusy)}
            onClick={() => void acceptComplaint(complaint.id)}
          >
            {complaintActionBusy === complaint.id ? <LoaderCircle size={14} className="librarian-support-spinner" /> : <Check size={14} />}
            Tiếp nhận đơn
          </button>
        )}
      </div>
      {complaint.acceptedById && (
        <>
        <form
          className="librarian-support-schedule"
          onSubmit={(event) => {
            event.preventDefault();
            void saveComplaintSchedule(complaint.id);
          }}
        >
          <label>
            <CalendarClock size={15} />
            <span>Hạn xử lý</span>
            <input
              type="datetime-local"
              min={dateTimeLocalValue(new Date().toISOString())}
              value={selectedComplaintId === complaint.id ? scheduleDraft : dateTimeLocalValue(complaint.dueAt)}
              disabled={complaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin'}
              onChange={(event) => setScheduleDraft(event.target.value)}
            />
          </label>
          <div>
            <button type="submit" disabled={!scheduleDraft || Boolean(complaintActionBusy) || (complaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin')}>
              {complaintActionBusy === complaint.id ? <LoaderCircle size={14} className="librarian-support-spinner" /> : <Check size={14} />}
              Lưu hạn
            </button>
            {complaint.dueAt && (
              <button type="button" disabled={Boolean(complaintActionBusy) || (complaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin')} onClick={() => void saveComplaintSchedule(complaint.id, true)}>
                Xóa hạn
              </button>
            )}
          </div>
        </form>
        {complaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin' && (
          <span className="librarian-support-workflow-note">Đơn này đang do thủ thư {complaint.acceptedByName} phụ trách.</span>
        )}
        </>
      )}
      {(complaint.firstRespondedAt || complaint.dueAt) && (
        <div className="librarian-support-workflow-times">
          {complaint.firstRespondedAt && <span>Phản hồi lần đầu: {dateTime(complaint.firstRespondedAt)}</span>}
          {complaint.dueAt && <span>Dự kiến xử lý: {dateTime(complaint.dueAt)}</span>}
        </div>
      )}
    </section>
  );

  return (
    <div className="librarian-support">
      <header className="librarian-support-heading">
        <div>
          <p>HỖ TRỢ ĐỘC GIẢ</p>
          <h1>{view === 'requests' ? 'Đơn tiếp nhận' : 'Phản hồi đơn'}</h1>
          <span>{view === 'requests'
            ? 'Quản lý loại đơn và tiếp nhận yêu cầu từ độc giả.'
            : 'Trả lời đơn hỗ trợ hoặc trao đổi trực tiếp với độc giả.'}</span>
        </div>
        <nav aria-label="Các mục hỗ trợ">
          <Link className={view === 'requests' ? 'is-active' : ''} to="/librarian/support/requests"><CircleHelp size={16} />Đơn tiếp nhận</Link>
          <Link className={view === 'replies' ? 'is-active' : ''} to="/librarian/support/replies"><MessageCircle size={16} />Phản hồi đơn</Link>
        </nav>
      </header>

      {error && <div className="librarian-support-alert librarian-support-alert--error" role="alert"><AlertCircle size={16} />{error}</div>}
      {notice && <div className="librarian-support-alert librarian-support-alert--success" role="status"><Check size={16} />{notice}</div>}

      <section className="librarian-support-queue" aria-live="polite">
        <div><strong>{openComplaints.length} đơn cần xử lý</strong><span>{pendingComplaints.length} chưa tiếp nhận · {openComplaints.length - pendingComplaints.length} đang xử lý</span></div>
        <span className={pendingComplaints.length ? 'has-pending' : ''}>{pendingComplaints.length} chờ tiếp nhận</span>
      </section>

      {view === 'requests' ? (
        <>
          <section className="librarian-support-types">
            <div className="librarian-support-section-heading">
              <div><Settings2 size={18} /><div><strong>Loại đơn hỗ trợ</strong><span>Độc giả sẽ chọn một trong các loại đơn đang mở.</span></div></div>
              <button type="button" disabled={typeSaving} onClick={() => void saveRequestTypes()}>
                {typeSaving ? <LoaderCircle size={15} className="librarian-support-spinner" /> : <Check size={15} />}Lưu loại đơn
              </button>
            </div>
            <div className="librarian-support-type-editor">
              {types.map((type) => (
                <span className="librarian-support-type-chip" key={type.id}>
                  {type.name}
                  <button type="button" aria-label={`Xóa ${type.name}`} onClick={() => removeRequestType(type.id)}>×</button>
                </span>
              ))}
              <form onSubmit={(event) => { event.preventDefault(); if (typeDraft.trim()) { setTypes((current) => [...current, { id: `new-${Date.now()}`, name: typeDraft.trim() }]); setTypeDraft(''); } }}>
                <input maxLength={100} placeholder="Thêm loại đơn..." value={typeDraft} onChange={(event) => setTypeDraft(event.target.value)} />
                <button type="submit" aria-label="Thêm loại đơn"><Plus size={16} /></button>
              </form>
            </div>
          </section>

          <div className="librarian-support-list-heading">
            <h2>Đơn từ độc giả</h2><span>{complaints.length} đơn</span>
          </div>
          {loading ? <div className="librarian-support-empty"><LoaderCircle size={20} className="librarian-support-spinner" />Đang tải đơn...</div> : complaints.length ? (
            <div className="librarian-support-ticket-layout">
              <section className="librarian-support-ticket-list" aria-label="Danh sách đơn hỗ trợ">
                {complaints.map((complaint) => (
                  <button
                    type="button"
                    className={`librarian-support-ticket-item${selectedComplaint?.id === complaint.id ? ' is-selected' : ''}`}
                    key={complaint.id}
                    onClick={() => {
                      setSelectedComplaintId(complaint.id);
                      setScheduleDraft(dateTimeLocalValue(complaint.dueAt));
                      setReplyDraft('');
                    }}
                  >
                    <span className={`librarian-support-status librarian-support-status--${complaint.status.toLowerCase()}`}>{complaintStatus[complaint.status] ?? complaint.status}</span>
                    <strong>{complaint.requestType}</strong>
                    <span>{complaint.readerName} · {complaint.readerEmail}</span>
                    <p>{complaint.content}</p>
                    <time>{dateTime(complaint.createdAt)}</time>
                  </button>
                ))}
              </section>

              {selectedComplaint ? (
                <section className="librarian-support-ticket-detail">
                  <header>
                    <div className="librarian-support-reader-avatar">
                      {selectedComplaint.readerAvatarUrl
                        ? <img src={selectedComplaint.readerAvatarUrl} alt="" />
                        : <UserRound size={18} />}
                    </div>
                    <div><strong>{selectedComplaint.readerName}</strong><span>{selectedComplaint.readerEmail}</span></div>
                    <span className={`librarian-support-status librarian-support-status--${selectedComplaint.status.toLowerCase()}`}>{complaintStatus[selectedComplaint.status] ?? selectedComplaint.status}</span>
                  </header>
                  <div className="librarian-support-ticket-content">
                    <span>{selectedComplaint.requestType} · {dateTime(selectedComplaint.createdAt)}</span>
                    <p>{selectedComplaint.content}</p>
                    {selectedComplaint.attachmentUrl && (
                      <a href={selectedComplaint.attachmentUrl} target="_blank" rel="noreferrer"><ImageIcon size={15} />Mở ảnh bằng chứng</a>
                    )}
                  </div>
                  {renderComplaintWorkflow(selectedComplaint)}
                  <div className="librarian-support-ticket-replies">
                    {selectedComplaint.replies.map((reply) => (
                      <article key={reply.id}>
                        <strong>{reply.senderName} · {reply.senderRole === 'Librarian' ? 'Thủ thư' : 'Độc giả'}</strong>
                        <p>{reply.message}</p><time>{dateTime(reply.createdAt)}</time>
                      </article>
                    ))}
                  </div>
                </section>
              ) : <div className="librarian-support-empty">Chọn đơn để xem nội dung.</div>}
            </div>
          ) : <div className="librarian-support-empty"><CircleHelp size={22} />Chưa có đơn hỗ trợ nào.</div>}
        </>
      ) : (
        <>
          <nav className="librarian-support-response-tabs" aria-label="Nội dung phản hồi">
            <button type="button" className={responseTab === 'complaints' ? 'is-active' : ''} onClick={() => setResponseTab('complaints')}>
              <CircleHelp size={15} />Phản hồi đơn
            </button>
            <button type="button" className={responseTab === 'chat' ? 'is-active' : ''} onClick={() => setResponseTab('chat')}>
              <MessageCircle size={15} />Chat realtime
            </button>
          </nav>
          {responseTab === 'complaints' ? (
            <>
              <div className="librarian-support-list-heading">
                <h2>Đơn cần phản hồi</h2><span>{openComplaints.length} đơn đang mở</span>
              </div>
              {loading ? <div className="librarian-support-empty"><LoaderCircle size={20} className="librarian-support-spinner" />Đang tải đơn...</div> : openComplaints.length ? (
                <div className="librarian-support-ticket-layout">
                  <section className="librarian-support-ticket-list" aria-label="Đơn cần phản hồi">
                    {openComplaints.map((complaint) => (
                      <button
                        type="button"
                        className={`librarian-support-ticket-item${selectedComplaintId === complaint.id ? ' is-selected' : ''}`}
                        key={complaint.id}
                        onClick={() => {
                          setSelectedComplaintId(complaint.id);
                          setScheduleDraft(dateTimeLocalValue(complaint.dueAt));
                          setReplyDraft('');
                        }}
                      >
                        <span className={`librarian-support-status librarian-support-status--${complaint.status.toLowerCase()}`}>{complaintStatus[complaint.status] ?? complaint.status}</span>
                        <strong>{complaint.requestType}</strong>
                        <span>{complaint.readerName} · {complaint.readerEmail}</span>
                        <p>{complaint.content}</p>
                        <time>{dateTime(complaint.createdAt)}</time>
                      </button>
                    ))}
                  </section>
                  {selectedComplaint ? (
                    <section className="librarian-support-ticket-detail">
                      <header>
                        <div className="librarian-support-reader-avatar">
                          {selectedComplaint.readerAvatarUrl
                            ? <img src={selectedComplaint.readerAvatarUrl} alt="" />
                            : <UserRound size={18} />}
                        </div>
                        <div><strong>{selectedComplaint.readerName}</strong><span>{selectedComplaint.readerEmail}</span></div>
                        <span className={`librarian-support-status librarian-support-status--${selectedComplaint.status.toLowerCase()}`}>{complaintStatus[selectedComplaint.status] ?? selectedComplaint.status}</span>
                      </header>
                      <div className="librarian-support-ticket-content">
                        <span>{selectedComplaint.requestType} · {dateTime(selectedComplaint.createdAt)}</span>
                        <p>{selectedComplaint.content}</p>
                        {selectedComplaint.attachmentUrl && (
                          <a href={selectedComplaint.attachmentUrl} target="_blank" rel="noreferrer"><ImageIcon size={15} />Mở ảnh bằng chứng</a>
                        )}
                      </div>
                      {renderComplaintWorkflow(selectedComplaint)}
                      <div className="librarian-support-ticket-replies">
                        {selectedComplaint.replies.map((reply) => (
                          <article key={reply.id}>
                            <strong>{reply.senderName} · {reply.senderRole === 'Librarian' ? 'Thủ thư' : 'Độc giả'}</strong>
                            <p>{reply.message}</p><time>{dateTime(reply.createdAt)}</time>
                          </article>
                        ))}
                      </div>
                      <form className="librarian-support-reply-form" onSubmit={(event) => void sendComplaintReply(event)}>
                        <textarea maxLength={3000} required rows={3} placeholder="Nhập phản hồi cho đơn này..." value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} />
                        <button
                          type="submit"
                          disabled={!replyDraft.trim() || replyBusy || (Boolean(selectedComplaint.acceptedById) && selectedComplaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin')}
                        >
                          {replyBusy ? <LoaderCircle size={16} className="librarian-support-spinner" /> : <Send size={16} />}Gửi phản hồi
                        </button>
                        {selectedComplaint.acceptedById && selectedComplaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin' && (
                          <span className="librarian-support-workflow-note">Đơn này đang do thủ thư {selectedComplaint.acceptedByName} phụ trách.</span>
                        )}
                      </form>
                    </section>
                  ) : <div className="librarian-support-empty">Chọn đơn để xem và gửi phản hồi.</div>}
                </div>
              ) : <div className="librarian-support-empty"><CircleHelp size={22} />Không có đơn đang chờ phản hồi.</div>}
            </>
          ) : (
        <section className="librarian-support-chat">
          <aside className="librarian-support-conversations">
            <header><strong>Cuộc trò chuyện</strong><span className={connection?.state === 'Connected' ? 'is-online' : ''}>{connection?.state === 'Connected' ? 'Đang trực tuyến' : 'Đang kết nối'}</span></header>
            {loading ? <div className="librarian-support-empty"><LoaderCircle size={18} className="librarian-support-spinner" /></div> :
              conversations.length ? conversations.map((conversation) => (
                <button type="button" className={`librarian-support-conversation${selectedReaderId === conversation.readerId ? ' is-selected' : ''}`} key={conversation.readerId} onClick={() => void openConversation(conversation)}>
                  <div className="librarian-support-reader-avatar">
                    {conversation.avatarUrl ? <img src={conversation.avatarUrl} alt="" /> : <UserRound size={17} />}
                  </div>
                  <div><strong>{conversation.readerName}</strong><span>{conversation.lastMessage.message}</span></div>
                  <time>{dateTime(conversation.lastMessage.createdAt)}</time>
                </button>
              )) : <div className="librarian-support-empty"><MessageCircle size={22} />Chưa có cuộc trò chuyện.</div>}
          </aside>

          <div className="librarian-support-chat-panel">
            {selectedReaderId ? (
              <>
                <div className="librarian-support-chat-messages" aria-live="polite">
                  {chatMessages.length ? chatMessages.map((message) => {
                    const mine = message.senderRole !== 'Reader';
                    return (
                      <article className={`librarian-support-chat-message${mine ? ' is-mine' : ''}`} key={message.id}>
                        <div className="librarian-support-chat-bubble">
                          {!mine && <strong>{message.senderName}</strong>}
                          <p>{message.message}</p><time>{dateTime(message.createdAt)}</time>
                        </div>
                      </article>
                    );
                  }) : <div className="librarian-support-empty"><MessageCircle size={22} />Chưa có tin nhắn.</div>}
                  <div ref={messagesEndRef} />
                </div>
                <form className="librarian-support-chat-composer" onSubmit={(event) => void sendChatReply(event)}>
                  <input maxLength={2000} placeholder="Nhập tin nhắn..." value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} />
                  <button type="submit" disabled={!chatDraft.trim() || !connection || chatBusy} aria-label="Gửi tin nhắn">
                    {chatBusy ? <LoaderCircle size={16} className="librarian-support-spinner" /> : <Send size={16} />}
                  </button>
                </form>
              </>
            ) : <div className="librarian-support-empty"><MessageCircle size={23} />Chọn một cuộc trò chuyện để bắt đầu phản hồi.</div>}
          </div>
        </section>
          )}
        </>
      )}
    </div>
  );
};

export default LibrarianSupportPage;
