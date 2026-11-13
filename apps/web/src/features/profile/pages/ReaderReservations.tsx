import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';

interface Reservation {
  id: string;
  bookId: string;
  bookTitle: string;
  status: string;
  reservedAt: string;
  expiresAt?: string | null;
}
const labels: Record<string, string> = {
  pending: 'Đang chờ sách', ready: 'Đã đến lượt', completed: 'Đã chuyển sang mượn',
  fulfilled: 'Đã chuyển sang mượn', cancelled: 'Đã hủy', expired: 'Hết hạn nhận',
};
const time = (value: string) => new Date(value).toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short',
});

export default function ReaderReservations({ token, revision }: { token: string | null; revision: number }) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError('');
      if (!token) { setLoading(false); setItems([]); return; }
      await fetch(`${API_BASE_URL}/api/v1/me/circulation/reservations`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async response => {
          const result = await parseApiResponse<{ success: boolean; data?: Reservation[]; error?: string }>(response);
          if (!response.ok || !result?.success || !result.data) throw new Error(result?.error || 'Không tải được đặt trước.');
          if (active) setItems(result.data);
        }).catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : 'Không tải được đặt trước.'); })
        .finally(() => { if (active) setLoading(false); });
    };
    void load();
    return () => { active = false; };
  }, [token, revision, tick]);
  const cancel = async () => {
    if (!cancelling || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/circulation/reservations/${cancelling.id}/cancel`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const result = await parseApiResponse<{ success: boolean; error?: string }>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể hủy đặt trước.');
      setCancelling(null); setTick(value => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể hủy đặt trước.'); }
    finally { setBusy(false); }
  };
  return <section className="history-list" aria-label="Đặt trước của tôi">
    {error && <div className="history-alert" role="alert">{error}<button type="button" className="history-renew-button" onClick={() => setTick(value => value + 1)}><RefreshCw size={14} /> Thử lại</button></div>}
    {loading ? <div className="history-empty" role="status">Đang tải đặt trước...</div> : !error && !items.length ? <div className="history-empty"><Bookmark size={22} />Bạn chưa có đặt trước.</div> : items.map(item => {
      const status = item.status.toLowerCase();
      const active = ['pending', 'ready'].includes(status);
      return <article className="history-record" key={item.id}>
        <div className="history-record-cover"><Bookmark size={24} /></div>
        <div className="history-record-main"><div className="history-record-title"><strong>{item.bookTitle}</strong></div>
          <span>{labels[status] || item.status}</span><span>Đặt lúc: {time(item.reservedAt)}</span>
          {status === 'ready' && item.expiresAt && <span className="history-record-warning">Gửi yêu cầu mượn trước {time(item.expiresAt)}</span>}
        </div>
        <div className="history-record-actions">
          <Link className="history-renew-button" to={`/books/${item.bookId}`}>{status === 'ready' ? 'Chọn lịch nhận' : 'Xem sách'}</Link>
          {active && <button type="button" className="history-renew-button" disabled={busy} onClick={() => setCancelling(item)}>Hủy đặt trước</button>}
        </div>
      </article>;
    })}
    {cancelling && <div className="history-payment-backdrop"><section className="history-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-reservation-title">
      <h2 id="cancel-reservation-title">Hủy đặt trước?</h2><p>{cancelling.bookTitle}</p><p>Bạn sẽ rời hàng chờ của cuốn sách này.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="history-renew-button" disabled={busy} onClick={() => setCancelling(null)}>Giữ đặt trước</button>
      <button type="button" className="history-pay-button" disabled={busy} onClick={() => void cancel()}>{busy ? 'Đang hủy...' : 'Xác nhận hủy'}</button>
    </section></div>}
  </section>;
}
