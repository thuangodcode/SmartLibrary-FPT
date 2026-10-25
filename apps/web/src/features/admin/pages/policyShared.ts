import { useCallback, useMemo, useState, type ElementType } from 'react';
import {
  BookMarked,
  CalendarClock,
  Clock3,
  FileText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';

export type PolicyType =
  | 'BorrowLimit'
  | 'BorrowDuration'
  | 'Renewal'
  | 'Reservation'
  | 'FineFee'
  | 'CategoryOverride'
  | 'Other';

export type PolicyStatus = 'Draft' | 'Active' | 'Inactive';

export interface PolicyParameter {
  key: string;
  value: string;
  label?: string | null;
}

export interface PolicyTarget {
  targetType: string;
  targetValue: string;
  targetLabel?: string | null;
}

export interface PolicyHistory {
  id: string;
  changedByName?: string | null;
  changeSummary: string;
  createdAt: string;
}

export interface PolicyListItem {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  policyType: PolicyType;
  status: PolicyStatus;
  priority: number;
  overridesGeneral: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDetail extends PolicyListItem {
  createdByName?: string | null;
  updatedByName?: string | null;
  parameters: PolicyParameter[];
  targets: PolicyTarget[];
  histories: PolicyHistory[];
}

export interface CategoryCount {
  key: string;
  label: string;
  count: number;
}

export interface ListResult {
  items: PolicyListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: CategoryCount[];
}

export interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

export interface SummaryCard {
  value: string;
  unit: string;
  label: string;
}

export type FormState = {
  name: string;
  description: string;
  policyType: PolicyType;
  status: PolicyStatus;
  priority: number;
  overridesGeneral: boolean;
  parameters: PolicyParameter[];
  targets: PolicyTarget[];
};

export const TYPE_LABELS: Record<PolicyType, string> = {
  BorrowLimit: 'Hạn mức mượn',
  BorrowDuration: 'Thời hạn mượn',
  Renewal: 'Gia hạn',
  Reservation: 'Đặt trước sách',
  FineFee: 'Phí phạt & lệ phí',
  CategoryOverride: 'Theo danh mục sách',
  Other: 'Chính sách khác',
};

export const STATUS_LABELS: Record<PolicyStatus, string> = {
  Active: 'Đang áp dụng',
  Inactive: 'Ngừng áp dụng',
  Draft: 'Bản nháp',
};

export const CATEGORY_ICONS: Record<string, ElementType> = {
  BorrowLimit: BookMarked,
  BorrowDuration: CalendarClock,
  Renewal: RefreshCw,
  Reservation: Clock3,
  FineFee: ShieldAlert,
  CategoryOverride: FileText,
  Other: ShieldCheck,
};

export const CHIP_ORDER = ['All', ...Object.keys(TYPE_LABELS)];

export const DEFAULT_PARAMS: Record<PolicyType, PolicyParameter[]> = {
  BorrowLimit: [
    { key: 'max_books', value: '', label: 'Hạn mức chung (cuốn)' },
    { key: 'max_books_student', value: '', label: 'Hạn mức sinh viên (cuốn)' },
    { key: 'max_books_lecturer', value: '', label: 'Hạn mức cán bộ/giảng viên (cuốn)' },
    { key: 'block_if_overdue', value: 'true', label: 'Chặn mượn khi còn sách quá hạn' },
    { key: 'exception_note', value: '', label: 'Lưu ý / ngoại lệ' },
  ],
  BorrowDuration: [
    { key: 'max_days', value: '', label: 'Số ngày mượn theo chính sách' },
    { key: 'max_days_vi', value: '', label: 'Sách tiếng Việt (chỉ dùng khi chưa đặt số ngày chung)' },
    { key: 'max_days_foreign', value: '', label: 'Sách ngoại văn (chỉ dùng khi chưa đặt số ngày chung)' },
  ],
  Renewal: [
    { key: 'max_renewals', value: '', label: 'Số lần gia hạn tối đa' },
    { key: 'renewal_days', value: '', label: 'Số ngày mỗi lần gia hạn' },
    { key: 'renewal_days_vi', value: '', label: 'Số ngày gia hạn sách tiếng Việt (tùy chọn)' },
    { key: 'renewal_days_foreign', value: '', label: 'Số ngày gia hạn sách ngoại văn (tùy chọn)' },
    { key: 'self_renew_before_days', value: '', label: 'Tự gia hạn trước hạn (ngày)' },
    { key: 'self_renew_after_days', value: '', label: 'Tự gia hạn sau hạn (ngày)' },
    { key: 'block_if_overdue', value: 'true', label: 'Không gia hạn khi quá hạn' },
    { key: 'block_if_reserved', value: 'false', label: 'Không gia hạn khi có đặt trước' },
    { key: 'textbook_requires_approval', value: 'true', label: 'Giáo trình cần thủ thư duyệt gia hạn' },
  ],
  Reservation: [
    { key: 'allow_reservation', value: 'true', label: 'Cho phép đặt trước' },
    { key: 'hold_hours', value: '', label: 'Thời gian giữ sách (giờ)' },
    { key: 'pickup_deadline_hours', value: '', label: 'Hạn nhận sách (giờ)' },
    { key: 'pickup_capacity_per_slot', value: '', label: 'Số lượt nhận tối đa mỗi khung giờ' },
  ],
  FineFee: [
    { key: 'overdue_fee_per_day', value: '', label: 'Phạt quá hạn mỗi ngày (VND)' },
    { key: 'damage_fee', value: '', label: 'Phí phạt sách hỏng (VND)' },
    { key: 'lost_book_fee', value: '', label: 'Phí phạt sách mất / hư nặng (VND)' },
    { key: 'restrict_if_unpaid', value: 'true', label: 'Hạn chế mượn khi còn phí chưa thanh toán' },
  ],
  CategoryOverride: [
    { key: 'max_books', value: '', label: 'Số lượng sách tối đa' },
    { key: 'max_days', value: '', label: 'Số ngày mượn tối đa' },
    { key: 'on_site_only', value: 'false', label: 'Chỉ đọc tại chỗ' },
  ],
  Other: [{ key: 'note', value: '', label: 'Lưu ý chính sách' }],
};

const DAY_KEYS = new Set([
  'max_days', 'max_days_vi', 'max_days_foreign', 'max_days_en',
  'renewal_days', 'renewal_days_vi', 'renewal_days_foreign', 'renewal_days_en',
]);
const WINDOW_DAY_KEYS = new Set(['self_renew_before_days', 'self_renew_after_days']);
const HOUR_KEYS = new Set(['hold_hours', 'pickup_deadline_hours', 'pickup_slot_minutes']);
const COUNT_KEYS = new Set([
  'max_books', 'max_books_student', 'max_books_lecturer',
  'max_renewals', 'pickup_capacity_per_slot', 'pickup_days_ahead',
]);
const FEE_KEYS = new Set([
  'overdue_fee_per_day', 'damage_fee', 'damaged_book_fee', 'lost_book_fee', 'lost_fee',
]);
const FLAG_KEYS = new Set([
  'block_if_overdue', 'block_if_reserved', 'restrict_if_unpaid',
  'allow_reservation', 'textbook_requires_approval', 'on_site_only',
]);

export type PolicyParamKind = 'integer' | 'boolean' | 'text';

export function paramKind(key: string): PolicyParamKind {
  if (FLAG_KEYS.has(key) || key.startsWith('block_')) return 'boolean';
  if (DAY_KEYS.has(key) || WINDOW_DAY_KEYS.has(key) || HOUR_KEYS.has(key) || COUNT_KEYS.has(key) || FEE_KEYS.has(key)) {
    return 'integer';
  }
  return 'text';
}

export function paramLimits(key: string): { min: number; max: number } {
  if (WINDOW_DAY_KEYS.has(key)) return { min: 0, max: 365 };
  if (DAY_KEYS.has(key)) return { min: 1, max: 365 };
  if (HOUR_KEYS.has(key)) return { min: 1, max: 720 };
  if (COUNT_KEYS.has(key)) return { min: 1, max: 200 };
  if (FEE_KEYS.has(key)) return { min: 1, max: 100_000_000 };
  return { min: 1, max: 365 };
}

export function paramHint(key: string): string {
  if (FEE_KEYS.has(key)) return 'Nhập số nguyên dương (VND). Xóa ô rồi gõ số mới nếu cần đổi.';
  if (DAY_KEYS.has(key) || WINDOW_DAY_KEYS.has(key)) return 'Nhập số nguyên dương. Có thể xóa giá trị cũ rồi nhập số mới.';
  if (HOUR_KEYS.has(key) || COUNT_KEYS.has(key)) return 'Nhập số nguyên dương hợp lệ.';
  return '';
}

function isIntInRange(value: string, min: number, max: number): boolean {
  if (!/^-?\d+$/.test(value)) return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}

export function validatePolicyForm(form: FormState): string | null {
  if (!form.name.trim()) return 'Vui lòng nhập tên chính sách.';
  let hasMaxDays = false;
  for (const parameter of form.parameters) {
    const value = parameter.value.trim();
    if (!value) continue;
    const kind = paramKind(parameter.key);
    if (kind === 'integer') {
      const { min, max } = paramLimits(parameter.key);
      if (!isIntInRange(value, min, max)) {
        return `${parameter.label || parameter.key}: nhập số nguyên từ ${min} đến ${max}.`;
      }
    }
    if (kind === 'boolean' && !['true', 'false', '1', '0'].includes(value.toLowerCase())) {
      return `${parameter.label || parameter.key}: chỉ nhận Có hoặc Không.`;
    }
    if (parameter.key === 'max_days') hasMaxDays = true;
  }
  if (form.status === 'Active' && form.policyType === 'BorrowDuration' && !hasMaxDays) {
    return 'Vui lòng nhập số ngày mượn (số nguyên dương).';
  }
  return null;
}

export const emptyForm = (type: PolicyType = 'BorrowLimit'): FormState => ({
  name: '',
  description: '',
  policyType: type,
  status: 'Draft',
  priority: type === 'CategoryOverride' ? 100 : 10,
  overridesGeneral: type === 'CategoryOverride',
  parameters: DEFAULT_PARAMS[type].map((p) => ({ ...p })),
  targets: [{ targetType: 'Role', targetValue: 'Reader', targetLabel: 'Độc giả' }],
});

export function formFromDetail(data: PolicyDetail): FormState {
  return {
    name: data.name,
    description: data.description ?? '',
    policyType: data.policyType,
    status: data.status,
    priority: data.priority,
    overridesGeneral: data.overridesGeneral,
    parameters: DEFAULT_PARAMS[data.policyType].map((defaultParameter) => {
      const configured = data.parameters.find((parameter) => parameter.key === defaultParameter.key);
      return configured
        ? { ...defaultParameter, value: configured.value, label: configured.label ?? defaultParameter.label }
        : { ...defaultParameter, value: '' };
    }).concat(data.parameters
      .filter((parameter) => !DEFAULT_PARAMS[data.policyType].some((defaultParameter) => defaultParameter.key === parameter.key))
      .map((parameter) => ({ key: parameter.key, value: parameter.value, label: parameter.label ?? undefined }))),
    targets: data.targets.length
      ? data.targets.map((t) => ({ ...t }))
      : [{ targetType: 'Role', targetValue: 'Reader', targetLabel: 'Độc giả' }],
  };
}

export function policyHref(code: string, suffix = '') {
  return `/admin/policies/${encodeURIComponent(code)}${suffix}`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN');
}

function formatFee(value: string): string {
  const n = Number(value.replace(/[^\d.]/g, ''));
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('vi-VN');
}

export function buildSummaryCards(parameters: PolicyParameter[]): SummaryCard[] {
  const byKey = new Map(parameters.map((p) => [p.key, p]));
  const cards: SummaryCard[] = [];
  const take = (key: string, unit: string, fallbackLabel: string, format?: (v: string) => string) => {
    const param = byKey.get(key);
    if (!param || !param.value.trim()) return;
    cards.push({
      value: format ? format(param.value) : param.value,
      unit,
      label: param.label && param.label !== key ? param.label : fallbackLabel,
    });
  };

  take('max_books', 'cuốn', 'Số sách tối đa');
  take('max_days', 'ngày', 'Số ngày mượn tối đa');
  take('max_renewals', 'lần', 'Số lần gia hạn tối đa');
  take('renewal_days', 'ngày', 'Số ngày mỗi lần gia hạn');
  take('overdue_fee_per_day', 'đ/ngày', 'Phạt quá hạn', formatFee);
  take('damage_fee', 'đ', 'Phí sách hỏng', formatFee);
  take('lost_book_fee', 'đ', 'Phí sách mất', formatFee);
  take('hold_hours', 'giờ', 'Thời gian giữ sách');
  take('pickup_deadline_hours', 'giờ', 'Hạn nhận sách');
  return cards.slice(0, 3);
}

export function orderedChips(categories: CategoryCount[]): CategoryCount[] {
  const map = new Map(categories.map((c) => [c.key, c]));
  return CHIP_ORDER.map((key) => {
    if (key === 'All') {
      return map.get('All') ?? {
        key: 'All',
        label: 'Tất cả',
        count: categories.filter((c) => c.key !== 'All').reduce((sum, c) => sum + c.count, 0),
      };
    }
    return map.get(key) ?? { key, label: TYPE_LABELS[key as PolicyType], count: 0 };
  });
}

export function usePolicyClient() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const authHeaders = useMemo(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }, [accessToken]);

  const showToast = useCallback((message: string, tone: 'success' | 'error') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  return { authHeaders, toast, showToast };
}
