import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest } from '../api';

export interface StaffLoan {
  id: string; code: string; barcode: string; bookTitle: string; coverImageUrl?: string;
  readerId: string; readerEmail?: string; readerName: string; studentId?: string; status: string; displayStatus: string;
  dueDate?: string; borrowDate?: string; pickupAt?: string; returnDate?: string;
  notes?: string; returnCondition?: string; copyCondition?: string; renewalCount?: number; canRenew?: boolean; overdueDays?: number; suggestedFine?: number; createdFineAmount?: number; incidentOpened?: boolean; incidentId?: string;
}
export interface LoanPage { items: StaffLoan[]; totalCount: number; totalPages: number }
export interface CopyLookup {
  id: string; bookId: string; barcode: string; bookTitle: string; coverImageUrl?: string;
  condition: string; location: string | null; isAvailable: boolean;
  canReturn: boolean; canShelve: boolean; openLoan: StaffLoan | null;
}
export interface Shelf { id: string; name: string; capacity: number; copyCount: number; availableCapacity: number }
export interface WarehouseCopy {
  id: string; barcode: string; bookTitle: string; condition: string; location: string | null;
}
export interface CopySummary { warehouseCopies: number; availableCopies: number; totalCopies: number }
export interface StaffStats { borrowed: number; overdue: number; dueSoon: number; pending: number; approved: number; pendingIncidents: number; damageFee: number; lostFee: number }
export interface Incident {
  id: string; borrowRecordId: string; readerId: string; kind: string; severity: string; status: string;
  barcode: string; bookTitle: string; readerName: string; description?: string;
  overdueDays: number; suggestedOverdueFine?: number; hasRecordedOverdueFine?: boolean; compensationAmount: number; overdueAmount: number; totalAmount: number;
  createdAt: string; confirmedAt?: string; copyCondition: string; loanStatus: string; canRestoreCopy: boolean;
}
export interface StaffFine { id: string; code: string; amount: number; reason: string; status: string; paidAt?: string }
export interface CopyHistory { loans: StaffLoan[]; incidents: Incident[] }
export interface LoanDetail { loan: StaffLoan; incidents: Incident[]; fines: StaffFine[] }
export const incidentNames: Record<string, string> = { Damage: 'Hư hỏng', PendingReview: 'Chờ xác minh', CompensationPending: 'Chờ thanh toán', Resolved: 'Đã thanh toán / miễn phí', Rejected: 'Đã từ chối hồ sơ', Light: 'Hư nhẹ', Severe: 'Hư nặng', Lost: 'Thất lạc', Unknown: 'Chưa xác định' };
export const fineNames: Record<string, string> = { Pending: 'Chưa thanh toán', Paid: 'Đã thanh toán', Waived: 'Đã miễn' };
export function copyPlace(copy: CopyLookup) {
  if (copy.openLoan) return ['Borrowed', 'Overdue'].includes(copy.openLoan.status) ? 'Độc giả đang giữ sách' : 'Đang giữ cho yêu cầu mượn';
  if (copy.condition === 'Lost') return 'Thất lạc — chưa ghi nhận tìm thấy';
  if (copy.condition === 'Damaged') return 'Trong kho — chờ xác minh / xử lý hư hỏng';
  if (copy.location) return copy.location;
  return copy.canShelve ? 'Trong kho — chờ xếp kệ' : 'Chưa đủ điều kiện sử dụng';
}
export const conditionNames: Record<string, string> = { LightDamaged: 'Hư nhẹ — còn sử dụng được', New: 'Mới', Good: 'Tốt', Fair: 'Cũ, còn sử dụng được', Damaged: 'Hư hỏng', Lost: 'Thất lạc' };
export const statusNames: Record<string, string> = { Active: 'Đang mượn', Pending: 'Chờ tiếp nhận', Approved: 'Chờ giao sách', Borrowed: 'Đang mượn', Overdue: 'Quá hạn', Returned: 'Đã trả', Rejected: 'Đã từ chối', Cancelled: 'Đã hủy' };
export function messageOf(error: unknown) {
  if (error instanceof ApiError && error.status === 0) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  return error instanceof Error ? error.message : 'Không thể tải dữ liệu. Vui lòng thử lại.';
}
export function dateOf(value?: string) { return value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }
export function dateTimeOf(value?: string) { return value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }
export function moneyOf(value: number) { return `${value.toLocaleString('vi-VN')} ₫`; }

// Retain the last good response during refresh; ignore responses from a previous view.
export function useStaffData<T>(path: string, token: string, revision = 0) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState<Record<string, unknown>>();
  const [tick, setTick] = useState(0);
  const version = useRef(0);
  const previousPath = useRef(path);
  const reload = useCallback(() => setTick(value => value + 1), []);
  useEffect(() => {
    const current = ++version.current;
    setLoading(true); setError('');
    if (previousPath.current !== path) { setData(undefined); setMeta(undefined); previousPath.current = path; }
    if (!path) { setLoading(false); return () => { version.current++; }; }
    void apiRequest<T>(path, {}, token).then(response => {
      if (current === version.current) { setData(response.data); setMeta(response.meta); }
    }).catch(error => { if (current === version.current) setError(messageOf(error)); })
      .finally(() => { if (current === version.current) setLoading(false); });
    return () => { version.current++; };
  }, [path, token, revision, tick]);
  return { data, meta, loading, error, reload };
}
