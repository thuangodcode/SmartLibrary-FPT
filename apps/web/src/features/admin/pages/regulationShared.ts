import { useCallback, useMemo, useState, type ElementType } from 'react';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  CalendarClock,
  Clock3,
  FileText,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';

export type RegulationType =
  | 'LibraryUse'
  | 'OpeningHours'
  | 'LibraryService'
  | 'Conduct'
  | 'Safety'
  | 'DocumentCare'
  | 'DocumentUse'
  | 'QuotaInfo'
  | 'ReturnRule'
  | 'RenewalInfo'
  | 'Compensation'
  | 'General'
  | 'Violation'
  | 'Other';

export type RegulationStatus = 'Draft' | 'PendingReview' | 'Active' | 'Inactive';

export interface RegulationParameter {
  key: string;
  value: string;
  label?: string | null;
}

export interface RegulationTarget {
  targetType: string;
  targetValue: string;
  targetLabel?: string | null;
}

export interface RegulationHistory {
  id: string;
  changedByName?: string | null;
  changeSummary: string;
  createdAt: string;
}

export interface RegulationListItem {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  policyType: RegulationType;
  status: RegulationStatus;
  priority: number;
  overridesGeneral: boolean;
  createdAt: string;
  updatedAt: string;
  updatedByName?: string | null;
  parameters: RegulationParameter[];
}

export interface RegulationDetail extends RegulationListItem {
  createdByName?: string | null;
  targets: RegulationTarget[];
  histories: RegulationHistory[];
}

export interface CategoryCount {
  key: string;
  label: string;
  count: number;
}

export interface ListResult {
  items: RegulationListItem[];
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

export type FormState = {
  name: string;
  description: string;
  policyType: RegulationType;
  status: RegulationStatus;
  priority: number;
  overridesGeneral: boolean;
  parameters: RegulationParameter[];
  targets: RegulationTarget[];
};

export const TYPE_LABELS: Record<RegulationType, string> = {
  LibraryUse: 'Sử dụng thư viện',
  OpeningHours: 'Thời gian hoạt động',
  LibraryService: 'Dịch vụ',
  Conduct: 'Trật tự và vệ sinh',
  Safety: 'An toàn thư viện',
  DocumentCare: 'Bảo quản tài liệu',
  DocumentUse: 'Mượn tài liệu',
  QuotaInfo: 'Hạn mức và thời hạn',
  ReturnRule: 'Trả tài liệu',
  RenewalInfo: 'Gia hạn',
  Compensation: 'Vi phạm và bồi thường',
  General: 'Quy định chung',
  Violation: 'Kỷ luật và vi phạm',
  Other: 'Quy định khác',
};

export const STATUS_LABELS: Record<RegulationStatus, string> = {
  Draft: 'Bản nháp',
  PendingReview: 'Chờ xác nhận',
  Active: 'Đã duyệt',
  Inactive: 'Ngừng áp dụng',
};

export const CATEGORY_ICONS: Record<string, ElementType> = {
  LibraryUse: ShieldCheck,
  OpeningHours: Clock3,
  LibraryService: BookOpen,
  Conduct: ScrollText,
  Safety: ShieldAlert,
  DocumentCare: BookMarked,
  DocumentUse: CalendarClock,
  QuotaInfo: Timer,
  ReturnRule: FileText,
  RenewalInfo: RefreshCw,
  Compensation: Wallet,
  General: FileText,
  Violation: AlertTriangle,
  Other: FileText,
};

const REFERENCE_PARAMS: RegulationParameter[] = [
  { key: 'source_url', value: 'https://library.fpt.edu.vn/Pages/Index/15', label: 'Nguồn tham khảo' },
  { key: 'source_label', value: 'Nội quy thư viện FPT (nguồn công khai FPTU)', label: 'Nhãn nguồn' },
  { key: 'campus_note', value: 'Nguồn ghi FPTU Hà Nội. Cần Admin xác nhận phạm vi áp dụng tại FPT TP.HCM trước khi duyệt.', label: 'Ghi chú xác minh tại campus' },
];

export const DEFAULT_PARAMS: Record<RegulationType, RegulationParameter[]> = {
  LibraryUse: REFERENCE_PARAMS.map((p) => ({ ...p })),
  OpeningHours: REFERENCE_PARAMS.map((p) => ({ ...p })),
  LibraryService: REFERENCE_PARAMS.map((p) => ({ ...p, value: p.key === 'source_url' ? 'https://library.fpt.edu.vn/Pages/Index/9' : p.value })),
  Conduct: REFERENCE_PARAMS.map((p) => ({ ...p })),
  Safety: REFERENCE_PARAMS.map((p) => ({ ...p })),
  DocumentCare: REFERENCE_PARAMS.map((p) => ({ ...p })),
  DocumentUse: REFERENCE_PARAMS.map((p) => ({ ...p, value: p.key === 'source_url' ? 'https://library.fpt.edu.vn/Pages/Index/9' : p.value })),
  QuotaInfo: REFERENCE_PARAMS.map((p) => ({ ...p, value: p.key === 'source_url' ? 'https://library.fpt.edu.vn/Pages/Index/9' : p.value })),
  ReturnRule: REFERENCE_PARAMS.map((p) => ({ ...p, value: p.key === 'source_url' ? 'https://library.fpt.edu.vn/Pages/Index/9' : p.value })),
  RenewalInfo: REFERENCE_PARAMS.map((p) => ({ ...p, value: p.key === 'source_url' ? 'https://library.fpt.edu.vn/Pages/Index/9' : p.value })),
  Compensation: REFERENCE_PARAMS.map((p) => ({ ...p, value: p.key === 'source_url' ? 'https://library.fpt.edu.vn/Pages/Index/9' : p.value })),
  General: REFERENCE_PARAMS.map((p) => ({ ...p })),
  Violation: REFERENCE_PARAMS.map((p) => ({ ...p })),
  Other: REFERENCE_PARAMS.map((p) => ({ ...p })),
};

export const emptyForm = (type: RegulationType = 'LibraryUse'): FormState => ({
  name: '',
  description: '',
  policyType: type,
  status: 'Draft',
  priority: 10,
  overridesGeneral: false,
  parameters: DEFAULT_PARAMS[type].map((p) => ({ ...p })),
  targets: [{ targetType: 'All', targetValue: '*', targetLabel: 'Tất cả bạn đọc' }],
});

export function formFromDetail(data: RegulationDetail): FormState {
  return {
    name: data.name,
    description: data.description ?? '',
    policyType: data.policyType,
    status: data.status,
    priority: data.priority,
    overridesGeneral: data.overridesGeneral,
    parameters: data.parameters.length
      ? data.parameters.map((p) => ({ key: p.key, value: p.value, label: p.label ?? undefined }))
      : (DEFAULT_PARAMS[data.policyType] ?? DEFAULT_PARAMS.General).map((p) => ({ ...p })),
    targets: data.targets.length
      ? data.targets.map((t) => ({ ...t }))
      : [{ targetType: 'All', targetValue: '*', targetLabel: 'Tất cả bạn đọc' }],
  };
}

export function regulationHref(code: string, suffix = '') {
  return `/admin/regulations/${encodeURIComponent(code)}${suffix}`;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN');
}

export function formatDateShort(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN');
}

export function getParam(parameters: RegulationParameter[] | undefined, key: string) {
  return parameters?.find((p) => p.key === key)?.value?.trim() ?? '';
}

export function bodyLines(text?: string | null) {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function useRegulationClient() {
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
