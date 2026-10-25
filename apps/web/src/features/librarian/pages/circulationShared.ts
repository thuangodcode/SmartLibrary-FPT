import { useMemo } from 'react';
import { useAuthStore } from '../../auth/store/useAuthStore';

export type CirculationTab = 'loans' | 'return' | 'reservations' | 'overdue' | 'fines';

export interface CirculationStats {
  borrowed: number;
  borrowedDelta: number;
  returned: number;
  returnedDelta: number;
  overdue: number;
  overdueDelta: number;
  unpaidFines: number;
  unpaidFinesDelta: number;
  dueSoon: number;
  suggestedFinePerDay: number;
}

export interface CirculationLoan {
  id: string;
  code: string;
  borrowDate?: string | null;
  dueDate?: string | null;
  pickupAt?: string | null;
  acceptedAt?: string | null;
  returnDate?: string | null;
  createdAt?: string | null;
  status: string;
  displayStatus: string;
  overdueDays: number;
  readerId: string;
  readerName: string;
  readerEmail?: string | null;
  studentId?: string | null;
  librarianName?: string | null;
  bookCopyId: string;
  barcode: string;
  bookTitle: string;
  copyCondition?: string | null;
  suggestedFine?: number | null;
  hasOpenFine?: boolean;
  hasFine?: boolean;
  renewalCount?: number;
  canRenew?: boolean;
  requiresApproval?: boolean;
  createdFineAmount?: number | null;
  incidentOpened?: boolean;
}

export interface CirculationIncident {
  id: string;
  borrowRecordId: string;
  readerId: string;
  kind: string;
  severity: string;
  status: string;
  barcode: string;
  bookTitle: string;
  readerName: string;
  overdueDays: number;
  suggestedOverdueFine?: number | null;
  replacementValue?: number | null;
  assessedFee?: number | null;
  compensationAmount: number;
  overdueAmount: number;
  totalAmount: number;
  compensationFineId?: string | null;
  overdueFineId?: string | null;
  description?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
}

export interface CirculationFine {
  id: string;
  code: string;
  borrowRecordId: string;
  readerId: string;
  readerName: string;
  bookTitle: string;
  barcode: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string;
  paidAt?: string | null;
}

export interface CirculationReservation {
  id: string;
  bookId: string;
  readerName: string;
  bookTitle: string;
  status: string;
  reservedAt: string;
  expiresAt?: string | null;
}

export interface CirculationActivity {
  id: string;
  at: string;
  kind: string;
  barcode: string;
  readerName: string;
}

export interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
  meta?: { message?: string };
}

export const STATUS_LABELS: Record<string, string> = {
  Pending: 'Chờ xác nhận',
  Approved: 'Đã tiếp nhận',
  Borrowed: 'Đang mượn',
  Returned: 'Đã trả',
  Overdue: 'Quá hạn',
  Rejected: 'Từ chối',
  Paid: 'Đã thanh toán',
  PendingReview: 'Chờ xác minh',
  CompensationPending: 'Chờ thanh toán',
  Resolved: 'Đã xử lý',
  Light: 'Hư hỏng nhẹ',
  Severe: 'Hư hỏng nặng',
  Lost: 'Mất sách',
  Damage: 'Hư hỏng',
  Unknown: 'Chưa đánh giá',
};

export const TABS = [
  {
    id: 'loans',
    to: '/librarian/circulation/loans',
    label: 'Mượn sách',
    crumb: 'Mượn sách',
    description: 'Lập phiếu mượn tại quầy và duyệt yêu cầu mượn của độc giả.',
  },
  {
    id: 'return',
    to: '/librarian/circulation/return',
    label: 'Trả sách',
    crumb: 'Trả sách',
    description: 'Ghi nhận trả sách và tình trạng của bản sao.',
  },
  {
    id: 'reservations',
    to: '/librarian/circulation/reservations',
    label: 'Đặt chỗ',
    crumb: 'Đặt chỗ',
    description: 'Theo dõi hàng đợi đặt trước và thông báo độc giả khi sách sẵn sàng.',
  },
  {
    id: 'overdue',
    to: '/librarian/circulation/overdue',
    label: 'Quá hạn',
    crumb: 'Quá hạn',
    description: 'Theo dõi phiếu quá hạn và xác minh hồ sơ mất sách, hư hỏng.',
  },
  {
    id: 'fines',
    to: '/librarian/circulation/fines',
    label: 'Phí phạt',
    crumb: 'Phí phạt',
    description: 'Xem khoản phí phạt và xác nhận đã thu tại quầy.',
  },
] as const;

export function tabPath(tab: CirculationTab) {
  return `/librarian/circulation/${tab}`;
}

export function isCirculationTab(value?: string): value is CirculationTab {
  return value === 'loans' || value === 'return' || value === 'reservations' || value === 'overdue' || value === 'fines';
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN');
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export function formatMoney(value?: number | null) {
  return `${Math.round(value ?? 0).toLocaleString('vi-VN')}đ`;
}

export function formatDelta(value: number) {
  if (value === 0) return 'Không đổi so với tuần trước';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('vi-VN')} so với tuần trước`;
}

export function reservationLabel(status: string) {
  const key = status.toLowerCase();
  if (key === 'ready' || key === 'available') return 'Sẵn sàng nhận';
  if (key === 'waiting' || key === 'pending') return 'Đang chờ';
  if (key === 'expired') return 'Hết hạn giữ';
  if (key === 'cancelled' || key === 'canceled') return 'Đã hủy';
  if (key === 'fulfilled') return 'Đã nhận';
  return STATUS_LABELS[status] ?? status;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.at(-1)?.[0] ?? 'Đ';
  const first = parts.length > 1 ? parts[0][0] : '';
  return `${first}${last}`.toUpperCase();
}

export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function useCirculationAuth() {
  const token = useAuthStore((s) => s.accessToken);
  return useMemo(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);
}
