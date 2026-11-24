import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import {
  AlertCircle,
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CircleHelp,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  UserRound,
  X,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { recoverRealtimeSession, useAuthStore } from '../../auth/store/useAuthStore';
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
  unreadCount: number;
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
  firstRespondedAt: string | null;
  completedAt: string | null;
  replies: ComplaintReply[];
}

type SupportView = 'requests' | 'chat';
type ComplaintFilter = 'pending' | 'inProgress' | 'awaitingReader' | 'resolved';

const dateTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

const complaintStatus: Record<string, string> = {
  Pending: 'Chưa tiếp nhận',
  InProgress: 'Chưa xử lý xong',
  AwaitingReader: 'Chờ độc giả bổ sung',
  Resolved: 'Đã xử lý',
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
    throw new Error(result?.error || `Yêu cầu hỗ trợ thất bại (HTTP ${response.status}).`);
  }
  return result.data;
}

const LibrarianSupportPage: React.FC<{ view: SupportView }> = ({ view }) => {
  const token = useAuthStore((state) => state.accessToken);
  const currentUser = useAuthStore((state) => state.user);
  const [types, setTypes] = useState<RequestType[]>([]);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [modalTypes, setModalTypes] = useState<RequestType[]>([]);
  const [modalTypeDraft, setModalTypeDraft] = useState('');
  const [typeSaving, setTypeSaving] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selectedComplaintId, setSelectedComplaintId] = useState('');
  const [complaintFilter, setComplaintFilter] = useState<ComplaintFilter>('inProgress');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [messageModes, setMessageModes] = useState<Record<string, 'reply' | 'requestInfo'>>({});
  const [replyBusy, setReplyBusy] = useState(false);
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
  const messagesStartRef = useRef<HTMLDivElement>(null);

  const loadTypes = useCallback(async () => {
    if (!token) return;
    const result = await fetchData<RequestType[]>('/api/v1/support/request-types', token);
    setTypes(result);
  }, [token]);

  const loadComplaints = useCallback(async () => {
    if (!token) return;
    const result = await fetchData<Complaint[]>('/api/v1/support/complaints', token);
    setComplaints(result);
    setSelectedComplaintId((current) => (current && result.some((item) => item.id === current) ? current : ''));
  }, [token]);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    const result = await fetchData<Conversation[]>('/api/v1/support/chat/conversations', token);
    setConversations(result);
  }, [token]);

  const markConversationRead = useCallback(async (readerId: string) => {
    if (!token) return;
    setConversations((current) => current.map((conversation) => conversation.readerId === readerId
      ? { ...conversation, unreadCount: 0 }
      : conversation));
    await fetchData<{ readerId: string }>(`/api/v1/support/chat/conversations/${readerId}/read`, token, { method: 'POST' });
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const hub = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/support-chat`, { accessTokenFactory: () => useAuthStore.getState().getAccessToken() })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    hub.on('ReceiveChatMessage', (message: ChatMessage) => {
      if (!active || message.readerId !== activeReaderRef.current) return;
      setChatMessages((current) => current.some((item) => item.id === message.id)
        ? current
        : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      if (message.senderRole === 'Reader') {
        void markConversationRead(message.readerId).catch(() => undefined);
      }
    });
    hub.on('ConversationUpdated', () => {
      if (active) void loadConversations().catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Không thể cập nhật danh sách trò chuyện.');
      });
    });
    hub.on('ConversationRead', (update: { readerId: string }) => {
      if (!active) return;
      setConversations((current) => current.map((conversation) => conversation.readerId === update.readerId
        ? { ...conversation, unreadCount: 0 }
        : conversation));
    });
    hub.on('NewComplaint', (complaint: Complaint) => {
      if (active) setComplaints((current) => current.some((item) => item.id === complaint.id)
        ? current
        : [complaint, ...current]);
    });
    hub.on('ComplaintUpdated', (complaint: Complaint) => {
      if (active) setComplaints((current) => current.some((item) => item.id === complaint.id)
        ? current.map((item) => item.id === complaint.id ? complaint : item)
        : [complaint, ...current]);
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
      .catch(async (caught: unknown) => {
        if (active && await recoverRealtimeSession(caught)) return;
        if (active) setError(caught instanceof Error ? `Không thể kết nối chat realtime: ${caught.message}` : 'Không thể kết nối chat realtime.');
      });
    return () => {
      active = false;
      activeReaderRef.current = '';
      setConnection(null);
      void hub.stop();
    };
  }, [token, loadTypes, loadComplaints, loadConversations, markConversationRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const pendingComplaints = complaints.filter((item) => item.status === 'Pending');
  const inProgressComplaints = complaints.filter((item) => item.status === 'InProgress');
  const awaitingReaderComplaints = complaints.filter((item) => item.status === 'AwaitingReader');
  const resolvedComplaints = complaints.filter((item) => item.status === 'Resolved');
  const filteredComplaints = complaintFilter === 'pending' ? pendingComplaints
    : complaintFilter === 'inProgress' ? inProgressComplaints
      : complaintFilter === 'awaitingReader' ? awaitingReaderComplaints : resolvedComplaints;
  const selectableComplaints = complaints;
  const selectedComplaint = selectedComplaintId
    ? (selectableComplaints.find((item) => item.id === selectedComplaintId) ?? null)
    : null;

  const acceptComplaint = async (complaintId: string) => {
    if (!token || complaintActionBusy) return;
    setComplaintActionBusy(complaintId);
    setError(null);
    setNotice(null);
    try {
      const updated = await fetchData<Complaint>(`/api/v1/support/complaints/${complaintId}/accept`, token, { method: 'POST' });
      setComplaints((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice('Đơn đã được tiếp nhận và ghi nhận thời gian xử lý.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tiếp nhận đơn.');
    } finally {
      setComplaintActionBusy('');
    }
  };

  const resolveComplaint = async (complaintId: string) => {
    if (!token || complaintActionBusy) return;
    setComplaintActionBusy(complaintId);
    setError(null);
    setNotice(null);
    try {
      const updated = await fetchData<Complaint>(`/api/v1/support/complaints/${complaintId}/resolve`, token, { method: 'POST' });
      setComplaints((current) => current.map((item) => item.id === updated.id ? updated : item));
      setComplaintFilter('resolved');
      setNotice('Đơn đã được chuyển sang trạng thái Đã xử lý.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật trạng thái đơn.');
    } finally {
      setComplaintActionBusy('');
    }
  };

  const continueComplaint = async (complaintId: string) => {
    if (!token || complaintActionBusy) return;
    setComplaintActionBusy(complaintId);
    setError(null);
    setNotice(null);
    try {
      const updated = await fetchData<Complaint>(`/api/v1/support/complaints/${complaintId}/continue`, token, { method: 'POST' });
      setComplaints((current) => current.map((item) => item.id === updated.id ? updated : item));
      setComplaintFilter('inProgress');
      setNotice('Đơn được giữ ở trạng thái Chưa xử lý xong để tiếp tục theo dõi.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật trạng thái đơn.');
    } finally {
      setComplaintActionBusy('');
    }
  };

  const handleOpenTypeModal = () => {
    setModalTypes([...types]);
    setModalTypeDraft('');
    setIsTypeModalOpen(true);
  };

  const handleCloseTypeModal = () => {
    setIsTypeModalOpen(false);
    setModalTypeDraft('');
  };

  const handleAddModalType = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = modalTypeDraft.trim();
    if (!trimmed) return;
    if (modalTypes.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Loại đơn này đã tồn tại trong danh sách.');
      return;
    }
    setModalTypes((prev) => [...prev, { id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, name: trimmed }]);
    setModalTypeDraft('');
  };

  const handleRemoveModalType = (id: string) => {
    setModalTypes((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSaveModalTypes = async () => {
    if (!token || typeSaving) return;
    const names = modalTypes.map((item) => item.name.trim()).filter(Boolean);
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
      setIsTypeModalOpen(false);
      setNotice('Danh sách loại đơn đã được cập nhật thành công.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu loại đơn.');
    } finally {
      setTypeSaving(false);
    }
  };

  const sendComplaintMessage = async (event: FormEvent<HTMLFormElement>, complaint: Complaint) => {
    event.preventDefault();
    if (!token || replyBusy || complaintActionBusy) return;
    const message = replyDrafts[complaint.id]?.trim() ?? '';
    if (!message) return;
    const mode = messageModes[complaint.id] ?? 'reply';
    setReplyBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'requestInfo') {
        const updated = await fetchData<Complaint>(`/api/v1/support/complaints/${complaint.id}/request-info`, token, {
          method: 'POST',
          body: JSON.stringify({ message }),
        });
        setComplaints((current) => current.map((item) => item.id === updated.id ? updated : item));
        setComplaintFilter('awaitingReader');
        setNotice('Đã gửi yêu cầu bổ sung thông tin cho độc giả.');
      } else {
        await fetchData<ComplaintReply>(`/api/v1/support/complaints/${complaint.id}/replies`, token, {
          method: 'POST',
          body: JSON.stringify({ message }),
        });
        await loadComplaints();
        setNotice('Phản hồi đã được gửi đến độc giả.');
      }
      setReplyDrafts((current) => ({ ...current, [complaint.id]: '' }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi nội dung trao đổi.');
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
    void markConversationRead(conversation.readerId).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Không thể đánh dấu cuộc trò chuyện đã đọc.');
    });
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
          {complaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin' && (
            <span className="librarian-support-workflow-note">{'\u0110\u01a1n n\u00e0y \u0111ang do th\u1ee7 th\u01b0 '}{complaint.acceptedByName}{' ph\u1ee5 tr\u00e1ch.'}</span>
          )}
          {complaint.firstRespondedAt && <div className="librarian-support-workflow-times"><span>{'Ph\u1ea3n h\u1ed3i l\u1ea7n \u0111\u1ea7u: '}{dateTime(complaint.firstRespondedAt)}</span></div>}
          {complaint.completedAt && <div className="librarian-support-completed-at"><Check size={14} /><span>{'Ho\u00e0n th\u00e0nh l\u00fac '}{dateTime(complaint.completedAt)}</span></div>}
          <div className="librarian-support-completion-actions">
            <button type="button" className="is-complete" disabled={Boolean(complaintActionBusy) || complaint.status === 'Resolved' || !complaint.firstRespondedAt || (complaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin')} onClick={() => void resolveComplaint(complaint.id)}>
              {complaintActionBusy === complaint.id && complaint.status !== 'Resolved' ? <LoaderCircle size={14} className="librarian-support-spinner" /> : <Check size={14} />}
              {'Đã hoàn thành'}
            </button>
            <button type="button" className="is-continuing" disabled={Boolean(complaintActionBusy) || (complaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin')} onClick={() => void continueComplaint(complaint.id)}>
              {complaintActionBusy === complaint.id && complaint.status === 'Resolved' ? <LoaderCircle size={14} className="librarian-support-spinner" /> : <ArrowRight size={14} />}
              {'Còn xử lý tiếp'}
            </button>
          </div>
        </>
      )}
    </section>
  );

  const renderTicketsGrid = (items: Complaint[]) => (
    <div className="lib-support-tickets-grid" role="list" aria-label="Danh sách đơn từ độc giả">
      {items.map((complaint) => (
        <div
          role="button"
          tabIndex={0}
          className="lib-support-ticket-card"
          key={complaint.id}
          onClick={() => setSelectedComplaintId(complaint.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSelectedComplaintId(complaint.id);
            }
          }}
        >
          <div className="lib-support-card-top">
            <span className="lib-support-card-type">{complaint.requestType}</span>
            <span className={`librarian-support-status librarian-support-status--${complaint.status.toLowerCase()}`}>
              {complaintStatus[complaint.status] ?? complaint.status}
            </span>
          </div>

          <div className="lib-support-card-reader">
            <div className="lib-support-card-avatar">
              {complaint.readerAvatarUrl ? (
                <img src={complaint.readerAvatarUrl} alt={complaint.readerName} />
              ) : (
                <UserRound size={16} />
              )}
            </div>
            <div className="lib-support-card-reader-meta">
              <strong title={complaint.readerName}>{complaint.readerName}</strong>
              <span title={complaint.readerEmail}>{complaint.readerEmail}</span>
            </div>
          </div>

          <p className="lib-support-card-snippet" title={complaint.content}>{complaint.content}</p>

          <div className="lib-support-card-footer">
            <time dateTime={complaint.createdAt}>{dateTime(complaint.createdAt)}</time>
            <div className="lib-support-card-badges">
              {complaint.attachmentUrl && (
                <span className="lib-support-card-badge-icon" title="Có ảnh đính kèm">
                  <ImageIcon size={13} />
                </span>
              )}
              {complaint.replies.length > 0 && (
                <span className="lib-support-card-badge-replies" title={`${complaint.replies.length} phản hồi`}>
                  <MessageCircle size={13} />
                  <span>{complaint.replies.length}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderDedicatedComplaintView = (complaint: Complaint) => (
    <section className="lib-support-dedicated-page" aria-label="Chi tiết đơn hỗ trợ">
      <div className="lib-support-dedicated-header">
        <button
          type="button"
          className="lib-support-back-btn"
          onClick={() => setSelectedComplaintId('')}
        >
          <ArrowLeft size={16} /> Quay lại danh sách đơn
        </button>
        <div className="lib-support-dedicated-header-tags">
          <span className="lib-support-card-type">{complaint.requestType}</span>
          <span className={`librarian-support-status librarian-support-status--${complaint.status.toLowerCase()}`}>
            {complaintStatus[complaint.status] ?? complaint.status}
          </span>
        </div>
      </div>

      <div className="lib-support-dedicated-grid">
        <div className="lib-support-dedicated-main">
          <div className="lib-support-dedicated-card lib-support-reader-banner">
            <div className="lib-support-reader-avatar-large">
              {complaint.readerAvatarUrl ? (
                <img src={complaint.readerAvatarUrl} alt={complaint.readerName} />
              ) : (
                <UserRound size={28} />
              )}
            </div>
            <div className="lib-support-reader-info">
              <h3>{complaint.readerName}</h3>
              <p>{complaint.readerEmail}</p>
              <time>Thời gian gửi đơn: {dateTime(complaint.createdAt)}</time>
            </div>
          </div>

          <div className="lib-support-dedicated-card">
            <h4 className="lib-support-card-heading">Nội dung yêu cầu / báo cáo</h4>
            <div className="lib-support-dedicated-body">
              <p>{complaint.content}</p>
            </div>
            {complaint.attachmentUrl && (
              <div className="lib-support-dedicated-attachment">
                <span className="lib-support-attachment-label">
                  <ImageIcon size={15} /> Hình ảnh đính kèm:
                </span>
                <div className="lib-support-attachment-preview">
                  <a href={complaint.attachmentUrl} target="_blank" rel="noreferrer" title="Xem ảnh gốc">
                    <img src={complaint.attachmentUrl} alt="Bằng chứng đính kèm" />
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="lib-support-dedicated-card">
            <h4 className="lib-support-card-heading">
              Lịch sử trao đổi & phản hồi ({complaint.replies.length})
            </h4>
            <div className="librarian-support-ticket-replies">
              {complaint.replies.length ? (
                complaint.replies.map((reply) => (
                  <article key={reply.id} className={reply.senderRole === 'Librarian' ? 'is-librarian-reply' : 'is-reader-reply'}>
                    <div className="lib-reply-header">
                      <strong>{reply.senderName} · {reply.senderRole === 'Librarian' ? 'Thủ thư' : 'Độc giả'}</strong>
                      <time>{dateTime(reply.createdAt)}</time>
                    </div>
                    <p>{reply.message}</p>
                  </article>
                ))
              ) : (
                <p className="lib-support-no-replies">Chưa có phản hồi nào cho đơn này.</p>
              )}
            </div>

            <form className="librarian-support-reply-form lib-support-unified-composer" onSubmit={(event) => void sendComplaintMessage(event, complaint)}>
              <div className="lib-support-composer-heading">
                <div><strong>Gửi nội dung cho độc giả</strong><span>Chọn cách xử lý, nhập nội dung một lần và gửi.</span></div>
                <span>{(replyDrafts[complaint.id] ?? '').length}/3000</span>
              </div>
              <div className="lib-support-composer-modes" role="group" aria-label="Chọn loại nội dung gửi">
                <button type="button" className={(messageModes[complaint.id] ?? 'reply') === 'reply' ? 'is-active' : ''} aria-pressed={(messageModes[complaint.id] ?? 'reply') === 'reply'} onClick={() => setMessageModes((current) => ({ ...current, [complaint.id]: 'reply' }))}>
                  <Send size={15} /> Phản hồi
                </button>
                <button type="button" className={(messageModes[complaint.id] ?? 'reply') === 'requestInfo' ? 'is-active is-request' : ''} aria-pressed={(messageModes[complaint.id] ?? 'reply') === 'requestInfo'} onClick={() => setMessageModes((current) => ({ ...current, [complaint.id]: 'requestInfo' }))}>
                  <MessageCircle size={15} /> Yêu cầu bổ sung
                </button>
              </div>
              <p className="lib-support-composer-hint">{(messageModes[complaint.id] ?? 'reply') === 'requestInfo'
                ? 'Độc giả sẽ nhận được yêu cầu này và đơn chuyển sang trạng thái chờ bổ sung thông tin.'
                : 'Gửi câu trả lời hoặc hướng dẫn xử lý cho độc giả.'}</p>
              <textarea
                maxLength={3000}
                required
                rows={4}
                placeholder={(messageModes[complaint.id] ?? 'reply') === 'requestInfo' ? 'Nêu rõ thông tin hoặc giấy tờ độc giả cần bổ sung...' : 'Nhập nội dung phản hồi cho độc giả...'}
                value={replyDrafts[complaint.id] ?? ''}
                onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [complaint.id]: event.target.value }))}
              />
              <button
                type="submit"
                disabled={!(replyDrafts[complaint.id]?.trim()) || replyBusy || Boolean(complaintActionBusy) || (Boolean(complaint.acceptedById) && complaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin') || ((messageModes[complaint.id] ?? 'reply') === 'requestInfo' && complaint.status === 'Resolved')}
              >
                {replyBusy ? <LoaderCircle size={16} className="librarian-support-spinner" /> : (messageModes[complaint.id] ?? 'reply') === 'requestInfo' ? <MessageCircle size={16} /> : <Send size={16} />}
                {(messageModes[complaint.id] ?? 'reply') === 'requestInfo' ? 'Gửi yêu cầu bổ sung' : 'Gửi phản hồi'}
              </button>
              {complaint.acceptedById && complaint.acceptedById !== currentUser?.id && currentUser?.role !== 'Admin' && (
                <span className="librarian-support-workflow-note">Đơn này đang do thủ thư {complaint.acceptedByName} phụ trách.</span>
              )}
            </form>
          </div>
        </div>

        <div className="lib-support-dedicated-side">
          <div className="lib-support-dedicated-card">
            <h4 className="lib-support-card-heading">Quy trình xử lý & Hạn giải quyết</h4>
            {renderComplaintWorkflow(complaint)}

          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="librarian-support">
      <header className="librarian-support-heading">
        <div>
          <div className="lib-support-eyebrow">
            <CircleHelp size={14} />
            <span>KHÔNG GIAN THỦ THƯ • HỖ TRỢ ĐỘC GIẢ</span>
          </div>
          <h1>{view === 'requests' ? 'Đơn tiếp nhận' : 'Chat hỗ trợ'}</h1>
          <span>{view === 'requests' ? 'Quản lý loại đơn và theo dõi yêu cầu theo trạng thái.' : 'Trao đổi trực tiếp với độc giả qua chat realtime.'}</span>
        </div>
      </header>

      {error && <div className="librarian-support-alert librarian-support-alert--error" role="alert"><AlertCircle size={16} />{error}</div>}
      {notice && <div className="librarian-support-alert librarian-support-alert--success" role="status"><Check size={16} />{notice}</div>}

      {view === 'requests' && <section className="librarian-support-queue" aria-live="polite">
        <div><strong>{complaints.length} đơn tiếp nhận</strong><span>{pendingComplaints.length} chưa tiếp nhận · {inProgressComplaints.length} chưa xử lý xong · {awaitingReaderComplaints.length} chờ độc giả bổ sung · {resolvedComplaints.length} đã xử lý</span></div>
        <span className={pendingComplaints.length ? 'has-pending' : ''}>{pendingComplaints.length} chờ tiếp nhận</span>
      </section>}

      {view === 'requests' ? (
        <>
          <section className="librarian-support-types">
            <div className="librarian-support-section-heading">
              <div><Settings2 size={18} /><div><strong>Loại đơn hỗ trợ ({types.length})</strong><span>Độc giả chọn một trong các loại đơn đang mở khi gửi yêu cầu.</span></div></div>
              <button type="button" className="lib-support-manage-types-btn" onClick={handleOpenTypeModal}><Settings2 size={15} />Quản lý loại đơn</button>
            </div>
            <div className="lib-support-type-preview-chips">{types.map((type) => <span className="librarian-support-type-chip" key={type.id}>{type.name}</span>)}</div>
          </section>
          {selectedComplaint ? renderDedicatedComplaintView(selectedComplaint) : (
            <>
              <nav className="librarian-support-status-tabs" aria-label="Lọc đơn theo trạng thái">
                <button type="button" className={complaintFilter === 'pending' ? 'is-active' : ''} onClick={() => { setComplaintFilter('pending'); setSelectedComplaintId(''); }}>Chưa tiếp nhận <span>{pendingComplaints.length}</span></button>
                <button type="button" className={complaintFilter === 'inProgress' ? 'is-active' : ''} onClick={() => { setComplaintFilter('inProgress'); setSelectedComplaintId(''); }}>Chưa xử lý xong <span>{inProgressComplaints.length}</span></button>
                <button type="button" className={complaintFilter === 'awaitingReader' ? 'is-active' : ''} onClick={() => { setComplaintFilter('awaitingReader'); setSelectedComplaintId(''); }}>Chờ độc giả bổ sung <span>{awaitingReaderComplaints.length}</span></button>
                <button type="button" className={complaintFilter === 'resolved' ? 'is-active' : ''} onClick={() => { setComplaintFilter('resolved'); setSelectedComplaintId(''); }}>Đã xử lý <span>{resolvedComplaints.length}</span></button>
              </nav>
              <div className="librarian-support-list-heading"><h2>{complaintFilter === 'pending' ? 'Đơn chưa tiếp nhận' : complaintFilter === 'inProgress' ? 'Đơn chưa xử lý xong' : complaintFilter === 'awaitingReader' ? 'Đơn chờ độc giả bổ sung' : 'Đơn đã xử lý'}</h2><span>{filteredComplaints.length} đơn</span></div>
              {loading ? <div className="librarian-support-empty"><LoaderCircle size={20} className="librarian-support-spinner" />Đang tải đơn...</div>
                : filteredComplaints.length ? renderTicketsGrid(filteredComplaints)
                  : <div className="librarian-support-empty"><CircleHelp size={22} />Không có đơn ở trạng thái này.</div>}
            </>
          )}
        </>
      ) : (
        <section className="librarian-support-chat">
          <aside className="librarian-support-conversations">
            <header><strong>Cuộc trò chuyện</strong><span className={connection?.state === 'Connected' ? 'is-online' : ''}>{connection?.state === 'Connected' ? 'Đang trực tuyến' : 'Đang kết nối'}</span></header>
            {loading ? <div className="librarian-support-empty"><LoaderCircle size={18} className="librarian-support-spinner" /></div> : conversations.length ? conversations.map((conversation) => (
              <button type="button" className={`librarian-support-conversation${selectedReaderId === conversation.readerId ? ' is-selected' : ''}${conversation.unreadCount > 0 ? ' has-unread' : ''}`} key={conversation.readerId} onClick={() => void openConversation(conversation)}>
                <div className="librarian-support-reader-avatar">{conversation.avatarUrl ? <img src={conversation.avatarUrl} alt="" /> : <UserRound size={17} />}</div>
                <div><strong>{conversation.readerName}</strong><span>{conversation.lastMessage.message}</span></div>
                <div className="librarian-support-conversation-meta"><time>{dateTime(conversation.lastMessage.createdAt)}</time>{conversation.unreadCount > 0 && <span className="librarian-support-unread-count" aria-label={`${conversation.unreadCount} tin nhắn chưa đọc`}>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}</div>
              </button>
            )) : <div className="librarian-support-empty"><MessageCircle size={22} />Chưa có cuộc trò chuyện.</div>}
          </aside>
          <div className="librarian-support-chat-panel">
            {selectedReaderId ? <>
              <div className="librarian-support-chat-messages" aria-live="polite">
                <div ref={messagesStartRef} />
                {chatMessages.length ? chatMessages.map((message) => {
                  const mine = message.senderRole !== 'Reader';
                  return <article className={`librarian-support-chat-message${mine ? ' is-mine' : ''}`} key={message.id}><div className="librarian-support-chat-bubble">{!mine && <strong>{message.senderName}</strong>}<p>{message.message}</p><time>{dateTime(message.createdAt)}</time></div></article>;
                }) : <div className="librarian-support-empty"><MessageCircle size={22} />Chưa có tin nhắn.</div>}
                <div ref={messagesEndRef} />
              </div>
              <div className="librarian-support-chat-scroll-controls" aria-label="Điều khiển cuộn tin nhắn">
                <button type="button" aria-label="Cuộn lên đầu cuộc trò chuyện" title="Lên đầu" onClick={() => messagesStartRef.current?.scrollIntoView({ behavior: 'smooth' })}><ArrowUp size={15} /></button>
                <button type="button" aria-label="Cuộn xuống cuối cuộc trò chuyện" title="Xuống cuối" onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}><ArrowDown size={15} /></button>
              </div>
              <form className="librarian-support-chat-composer" onSubmit={(event) => void sendChatReply(event)}><input maxLength={2000} placeholder="Nhập tin nhắn..." value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} /><button type="submit" disabled={!chatDraft.trim() || !connection || chatBusy} aria-label="Gửi tin nhắn">{chatBusy ? <LoaderCircle size={16} className="librarian-support-spinner" /> : <Send size={16} />}</button></form>
            </> : <div className="librarian-support-empty"><MessageCircle size={23} />Chọn một cuộc trò chuyện để bắt đầu phản hồi.</div>}
          </div>
        </section>
      )}

      {isTypeModalOpen && (
        <div className="lib-support-modal-backdrop" onClick={handleCloseTypeModal}>
          <div className="lib-support-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="lib-support-modal-header">
              <div className="lib-support-modal-header-icon"><Settings2 size={22} /></div>
              <div className="lib-support-modal-header-text">
                <h3>Quản lý loại đơn hỗ trợ</h3>
                <p>Thêm, bớt hoặc chỉnh sửa danh mục loại đơn độc giả có thể chọn khi gửi hỗ trợ.</p>
              </div>
              <button type="button" className="lib-support-modal-close" onClick={handleCloseTypeModal} aria-label="Đóng hộp thoại"><X size={18} /></button>
            </div>
            <div className="lib-support-modal-body">
              <form className="lib-support-modal-add-form" onSubmit={handleAddModalType}>
                <input type="text" placeholder="Nhập tên loại đơn mới..." value={modalTypeDraft} onChange={(event) => setModalTypeDraft(event.target.value)} maxLength={100} />
                <button type="submit" disabled={!modalTypeDraft.trim()}><Plus size={16} />Thêm</button>
              </form>
              <div className="lib-support-modal-chips-title"><span>Danh sách loại đơn hiện tại ({modalTypes.length}):</span></div>
              <div className="lib-support-modal-chips-list">
                {modalTypes.map((type) => (
                  <span className="lib-support-modal-chip" key={type.id}>
                    <span>{type.name}</span>
                    <button type="button" aria-label={`Xóa ${type.name}`} onClick={() => handleRemoveModalType(type.id)}><X size={13} /></button>
                  </span>
                ))}
                {!modalTypes.length && <p className="lib-support-modal-empty">Chưa có loại đơn nào. Vui lòng thêm ít nhất một loại đơn.</p>}
              </div>
            </div>
            <div className="lib-support-modal-footer">
              <button type="button" className="lib-support-btn-secondary" onClick={handleCloseTypeModal}>Đóng</button>
              <button type="button" className="lib-support-btn-primary" disabled={typeSaving || !modalTypes.length} onClick={() => void handleSaveModalTypes()}>
                {typeSaving ? <LoaderCircle size={15} className="librarian-support-spinner" /> : <Check size={15} />}Lưu loại đơn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibrarianSupportPage;
