import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import {
  Ban,
  BookMarked,
  CalendarClock,
  Clock3,
  FileText,
  History,
  Layers3,
  LoaderCircle,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminPoliciesPage.css';

type PolicyType =
  | 'BorrowLimit'
  | 'BorrowDuration'
  | 'Renewal'
  | 'Reservation'
  | 'FineFee'
  | 'CategoryOverride'
  | 'Other';

type PolicyStatus = 'Draft' | 'Active' | 'Inactive';

interface PolicyParameter {
  key: string;
  value: string;
  label?: string | null;
}

interface PolicyTarget {
  targetType: string;
  targetValue: string;
  targetLabel?: string | null;
}

interface PolicyHistory {
  id: string;
  changedByName?: string | null;
  changeSummary: string;
  beforeJson?: string | null;
  afterJson?: string | null;
  createdAt: string;
}

interface PolicyListItem {
  id: string;
  name: string;
  description?: string | null;
  policyType: PolicyType;
  status: PolicyStatus;
  priority: number;
  overridesGeneral: boolean;
  createdAt: string;
}

interface PolicyDetail extends PolicyListItem {
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  updatedAt: string;
  createdByName?: string | null;
  updatedByName?: string | null;
  parameters: PolicyParameter[];
  targets: PolicyTarget[];
  histories: PolicyHistory[];
}

interface CategoryCount {
  key: string;
  label: string;
  count: number;
}

interface ListResult {
  items: PolicyListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: CategoryCount[];
}

interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

const TYPE_LABELS: Record<PolicyType, string> = {
  BorrowLimit: 'Hạn mức mượn',
  BorrowDuration: 'Thời hạn mượn',
  Renewal: 'Gia hạn',
  Reservation: 'Đặt trước sách',
  FineFee: 'Phí phạt & lệ phí',
  CategoryOverride: 'Theo danh mục sách',
  Other: 'Quy định khác',
};

const STATUS_LABELS: Record<PolicyStatus, string> = {
  Active: 'Đang áp dụng',
  Inactive: 'Ngừng áp dụng',
  Draft: 'Bản nháp',
};

const CATEGORY_ICONS: Record<string, ElementType> = {
  All: Layers3,
  BorrowLimit: BookMarked,
  BorrowDuration: CalendarClock,
  Renewal: RefreshCw,
  Reservation: Clock3,
  FineFee: ShieldAlert,
  CategoryOverride: FileText,
  Other: ShieldCheck,
};

const DEFAULT_PARAMS: Record<PolicyType, PolicyParameter[]> = {
  BorrowLimit: [
    { key: 'max_books', value: '5', label: 'Số lượng sách tối đa' },
    { key: 'exception_note', value: '', label: 'Ngoại lệ' },
  ],
  BorrowDuration: [{ key: 'max_days', value: '14', label: 'Số ngày mượn tối đa' }],
  Renewal: [
    { key: 'max_renewals', value: '2', label: 'Số lần gia hạn tối đa' },
    { key: 'renewal_days', value: '7', label: 'Số ngày mỗi lần gia hạn' },
    { key: 'block_if_overdue', value: 'true', label: 'Không gia hạn khi quá hạn' },
    { key: 'block_if_reserved', value: 'true', label: 'Không gia hạn khi có đặt trước' },
  ],
  Reservation: [
    { key: 'allow_reservation', value: 'true', label: 'Cho phép đặt trước' },
    { key: 'hold_hours', value: '48', label: 'Thời gian giữ sách (giờ)' },
    { key: 'pickup_deadline_hours', value: '24', label: 'Hạn nhận sách (giờ)' },
  ],
  FineFee: [
    { key: 'overdue_fee_per_day', value: '5000', label: 'Phạt quá hạn mỗi ngày (VND)' },
    { key: 'lost_book_multiplier', value: '1.5', label: 'Hệ số bồi thường mất sách' },
  ],
  CategoryOverride: [
    { key: 'max_books', value: '2', label: 'Số lượng sách tối đa' },
    { key: 'max_days', value: '7', label: 'Số ngày mượn tối đa' },
    { key: 'on_site_only', value: 'false', label: 'Chỉ đọc tại chỗ' },
  ],
  Other: [{ key: 'note', value: '', label: 'Nội dung quy định' }],
};

type FormState = {
  name: string;
  description: string;
  policyType: PolicyType;
  status: PolicyStatus;
  priority: number;
  overridesGeneral: boolean;
  parameters: PolicyParameter[];
  targets: PolicyTarget[];
};

const emptyForm = (type: PolicyType = 'BorrowLimit'): FormState => ({
  name: '',
  description: '',
  policyType: type,
  status: 'Draft',
  priority: type === 'CategoryOverride' ? 100 : 10,
  overridesGeneral: type === 'CategoryOverride',
  parameters: DEFAULT_PARAMS[type].map((p) => ({ ...p })),
  targets: [{ targetType: 'Role', targetValue: 'Reader', targetLabel: 'Độc giả' }],
});

const AdminPoliciesPage: React.FC = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [category, setCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [detailTab, setDetailTab] = useState<'general' | 'rules' | 'targets' | 'history'>('general');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const authHeaders = useMemo(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }, [accessToken]);

  const showToast = (message: string, tone: 'success' | 'error') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2800);
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '8',
      });
      if (search.trim()) params.set('search', search.trim());
      if (category !== 'All') params.set('type', category);
      if (statusFilter !== 'All') params.set('status', statusFilter);

      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules?${params}`, { headers: authHeaders });
      const json = await parseApiResponse<ApiResult<ListResult>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Không tải được danh sách chính sách.');
      }
      setList(json.data);
      setSelectedId((current) => {
        if (current && json.data!.items.some((i) => i.id === current)) return current;
        return json.data!.items[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu.');
      setList(null);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, category, page, search, statusFilter]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${id}`, { headers: authHeaders });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Không tải được chi tiết.');
      }
      setDetail(json.data);
    } catch (err) {
      setDetail(null);
      showToast(err instanceof Error ? err.message : 'Lỗi tải chi tiết.', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm(category !== 'All' ? (category as PolicyType) : 'BorrowLimit'));
    setModalOpen(true);
  };

  const fillFormFromDetail = (data: PolicyDetail) => {
    setEditingId(data.id);
    setForm({
      name: data.name,
      description: data.description ?? '',
      policyType: data.policyType,
      status: data.status,
      priority: data.priority,
      overridesGeneral: data.overridesGeneral,
      parameters: data.parameters.length
        ? data.parameters.map((p) => ({ key: p.key, value: p.value, label: p.label ?? undefined }))
        : DEFAULT_PARAMS[data.policyType].map((p) => ({ ...p })),
      targets: data.targets.length
        ? data.targets.map((t) => ({ ...t }))
        : [{ targetType: 'Role', targetValue: 'Reader', targetLabel: 'Độc giả' }],
    });
    setModalOpen(true);
  };

  const openEdit = () => {
    if (!detail) return;
    fillFormFromDetail(detail);
  };

  const openEditFromList = async (id: string) => {
    setSelectedId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${id}`, { headers: authHeaders });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Không tải được chi tiết.');
      }
      setDetail(json.data);
      fillFormFromDetail(json.data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi tải chi tiết.', 'error');
    }
  };

  const onTypeChange = (policyType: PolicyType) => {
    setForm((prev) => ({
      ...prev,
      policyType,
      priority: policyType === 'CategoryOverride' ? 100 : prev.priority || 10,
      overridesGeneral: policyType === 'CategoryOverride' ? true : prev.overridesGeneral,
      parameters: DEFAULT_PARAMS[policyType].map((p) => {
        const existing = prev.parameters.find((x) => x.key === p.key);
        return existing ? { ...p, value: existing.value } : { ...p };
      }),
    }));
  };

  const savePolicy = async () => {
    if (!form.name.trim()) {
      showToast('Vui lòng nhập tên chính sách.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        policyType: form.policyType,
        status: form.status,
        priority: form.priority,
        overridesGeneral: form.overridesGeneral,
        parameters: form.parameters,
        targets: form.targets,
      };
      const url = editingId
        ? `${API_BASE_URL}/api/v1/policy-rules/${editingId}`
        : `${API_BASE_URL}/api/v1/policy-rules`;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Lưu chính sách thất bại.');
      }
      setModalOpen(false);
      setSelectedId(json.data.id);
      showToast(editingId ? 'Đã cập nhật chính sách.' : 'Đã tạo chính sách.', 'success');
      await loadList();
      await loadDetail(json.data.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi lưu chính sách.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: PolicyStatus) => {
    if (!detail) return;
    const label = STATUS_LABELS[status];
    if (!window.confirm(`Bạn chắc chắn muốn chuyển trạng thái sang "${label}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${detail.id}/status`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ status }),
      });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Đổi trạng thái thất bại.');
      }
      setDetail(json.data);
      showToast('Đã cập nhật trạng thái.', 'success');
      await loadList();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi đổi trạng thái.', 'error');
    }
  };

  const categories = list?.categories ?? [];

  return (
    <section className="pol-page">
      {toast && <div className={`pol-toast pol-toast--${toast.tone}`}>{toast.message}</div>}

      <header className="pol-heading">
        <div className="pol-heading-icon"><ShieldCheck size={28} /></div>
        <div>
          <h1>Quản lý chính sách thư viện</h1>
          <p>Cấu hình các quy định, giới hạn và điều kiện áp dụng trong thư viện.</p>
        </div>
      </header>

      <div className="pol-grid">
        {/* Left: categories */}
        <aside className="pol-card pol-categories">
          <h2>Danh mục chính sách</h2>
          <ul>
            {categories.map((c) => {
              const Icon = CATEGORY_ICONS[c.key] ?? FileText;
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    className={category === c.key ? 'active' : ''}
                    onClick={() => {
                      setCategory(c.key);
                      setPage(1);
                    }}
                  >
                    <span className="pol-cat-main">
                      <Icon size={20} />
                      <span>{c.label}</span>
                    </span>
                    <em>{c.count}</em>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Middle: list */}
        <div className="pol-card pol-list">
          <div className="pol-list-toolbar">
            <div className="pol-search">
              <Search size={17} />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearch(searchInput);
                    setPage(1);
                  }
                }}
                placeholder="Tìm kiếm chính sách..."
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="All">Tất cả trạng thái</option>
              <option value="Active">Đang áp dụng</option>
              <option value="Inactive">Ngừng áp dụng</option>
              <option value="Draft">Bản nháp</option>
            </select>
            <button type="button" className="pol-btn pol-btn--primary" onClick={openCreate}>
              <Plus size={17} /> Thêm chính sách
            </button>
          </div>

          {loading ? (
            <div className="pol-empty"><LoaderCircle className="spin" size={22} /> Đang tải...</div>
          ) : error ? (
            <div className="pol-empty pol-empty--error">{error}</div>
          ) : !list?.items.length ? (
            <div className="pol-empty">Không có chính sách phù hợp.</div>
          ) : (
            <div className="pol-table-wrap">
              <table className="pol-table">
                <thead>
                  <tr>
                    <th>Tên chính sách</th>
                    <th>Loại</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => {
                    const RowIcon = CATEGORY_ICONS[item.policyType] ?? FileText;
                    return (
                      <tr
                        key={item.id}
                        className={selectedId === item.id ? 'selected' : ''}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <td>
                          <div className="pol-name-cell">
                            <span className="pol-row-icon"><RowIcon size={19} /></span>
                            <div>
                              <strong>{item.name}</strong>
                              <small>{item.description || 'Không có mô tả'}</small>
                            </div>
                          </div>
                        </td>
                        <td><span className={`pol-tag pol-tag--${item.policyType}`}>{TYPE_LABELS[item.policyType]}</span></td>
                        <td><span className={`pol-status pol-status--${item.status}`}>{STATUS_LABELS[item.status]}</span></td>
                        <td className="pol-row-actions">
                          <button
                            type="button"
                            className="pol-icon-btn"
                            aria-label="Thao tác"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(item.id);
                              openEditFromList(item.id);
                            }}
                          >
                            <MoreVertical size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {list && list.totalCount > 0 && (
            <div className="pol-pagination">
              <span>
                Hiển thị {(list.page - 1) * list.pageSize + 1}
                {' - '}
                {Math.min(list.page * list.pageSize, list.totalCount)} trong {list.totalCount} chính sách
              </span>
              <div>
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trước</button>
                {Array.from({ length: list.totalPages }, (_, i) => i + 1).slice(0, 5).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={n === page ? 'is-active' : ''}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button type="button" disabled={page >= list.totalPages} onClick={() => setPage((p) => p + 1)}>Sau</button>
              </div>
            </div>
          )}
        </div>

        {/* Right: detail */}
        <aside className="pol-card pol-detail">
          {!selectedId ? (
            <div className="pol-empty">Chọn một chính sách để xem chi tiết.</div>
          ) : detailLoading || !detail ? (
            <div className="pol-empty"><LoaderCircle className="spin" size={22} /> Đang tải chi tiết...</div>
          ) : (
            <>
              <div className="pol-detail-head">
                <div className="pol-detail-title">
                  <span className="pol-detail-icon">
                    {(() => {
                      const DetailIcon = CATEGORY_ICONS[detail.policyType] ?? FileText;
                      return <DetailIcon size={22} />;
                    })()}
                  </span>
                  <div>
                    <span className={`pol-status pol-status--${detail.status}`}>{STATUS_LABELS[detail.status]}</span>
                    <h2>{detail.name}</h2>
                    <p>{detail.description || 'Không có mô tả.'}</p>
                  </div>
                </div>
                <button type="button" className="pol-btn pol-btn--outline" onClick={openEdit}>
                  <Pencil size={16} /> Chỉnh sửa
                </button>
              </div>

              <div className="pol-status-actions">
                {detail.status !== 'Active' && (
                  <button type="button" className="pol-btn pol-btn--primary" onClick={() => void changeStatus('Active')}>
                    <ShieldCheck size={16} /> Kích hoạt
                  </button>
                )}
                {detail.status === 'Active' && (
                  <button type="button" className="pol-btn" onClick={() => void changeStatus('Inactive')}>
                    <Ban size={16} /> Ngừng áp dụng
                  </button>
                )}
                {detail.status !== 'Draft' && (
                  <button type="button" className="pol-btn" onClick={() => void changeStatus('Draft')}>
                    Đưa về nháp
                  </button>
                )}
              </div>

              <div className="pol-tabs">
                <button type="button" className={detailTab === 'general' ? 'active' : ''} onClick={() => setDetailTab('general')}>Thông tin chung</button>
                <button type="button" className={detailTab === 'rules' ? 'active' : ''} onClick={() => setDetailTab('rules')}>Chi tiết quy định</button>
                <button type="button" className={detailTab === 'targets' ? 'active' : ''} onClick={() => setDetailTab('targets')}>Đối tượng áp dụng</button>
                <button type="button" className={detailTab === 'history' ? 'active' : ''} onClick={() => setDetailTab('history')}>Lịch sử thay đổi</button>
              </div>

              <div className="pol-detail-body">
              {detailTab === 'general' && (
                <>
                  <dl className="pol-kv">
                    <div><dt>Loại chính sách</dt><dd>{TYPE_LABELS[detail.policyType]}</dd></div>
                    <div><dt>Tên chính sách</dt><dd>{detail.name}</dd></div>
                    <div><dt>Mô tả</dt><dd>{detail.description || '—'}</dd></div>
                    <div><dt>Trạng thái</dt><dd><span className={`pol-status pol-status--${detail.status}`}>{STATUS_LABELS[detail.status]}</span></dd></div>
                    <div><dt>Ưu tiên / ghi đè</dt><dd>{detail.priority}{detail.overridesGeneral ? ' · Ghi đè chính sách chung' : ''}</dd></div>
                    <div><dt>Ngày tạo</dt><dd>{new Date(detail.createdAt).toLocaleString('vi-VN')}</dd></div>
                    <div><dt>Người tạo</dt><dd>{detail.createdByName || 'Hệ thống / Admin'}</dd></div>
                  </dl>
                  <h3 className="pol-section-title">Quy định cụ thể</h3>
                  {detail.parameters.length === 0 ? (
                    <p className="pol-muted">Chưa có tham số cấu hình.</p>
                  ) : detail.parameters.map((p) => (
                    <div key={p.key} className="pol-rule-row">
                      <span>{p.label || p.key}</span>
                      <strong>{p.value || '—'}</strong>
                    </div>
                  ))}
                  <div className="pol-note">
                    <strong>Lưu ý</strong>
                    <p>Chính sách này có thể được điều chỉnh bởi Quản trị hệ thống. Mọi thay đổi sẽ được ghi nhận trong lịch sử.</p>
                  </div>
                </>
              )}

              {detailTab === 'rules' && (
                <div className="pol-rules">
                  {detail.parameters.length === 0 ? (
                    <p className="pol-muted">Chưa có tham số cấu hình.</p>
                  ) : detail.parameters.map((p) => (
                    <div key={p.key} className="pol-rule-row">
                      <span>{p.label || p.key}</span>
                      <strong>{p.value || '—'}</strong>
                    </div>
                  ))}
                </div>
              )}

              {detailTab === 'targets' && (
                <div className="pol-targets">
                  {detail.targets.length === 0 ? (
                    <p className="pol-muted">Chưa gán đối tượng áp dụng.</p>
                  ) : detail.targets.map((t, idx) => (
                    <div key={`${t.targetType}-${t.targetValue}-${idx}`} className="pol-target-row">
                      <Users size={15} />
                      <div>
                        <strong>{t.targetLabel || t.targetValue}</strong>
                        <small>{t.targetType}: {t.targetValue}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {detailTab === 'history' && (
                <div className="pol-history">
                  {detail.histories.length === 0 ? (
                    <p className="pol-muted">Chưa có lịch sử thay đổi.</p>
                  ) : detail.histories.map((h) => (
                    <div key={h.id} className="pol-history-row">
                      <History size={15} />
                      <div>
                        <strong>{h.changeSummary}</strong>
                        <small>{h.changedByName || 'Hệ thống'} · {new Date(h.createdAt).toLocaleString('vi-VN')}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </>
          )}
        </aside>
      </div>

      {modalOpen && (
        <div className="pol-modal-scrim" role="presentation" onClick={() => !saving && setModalOpen(false)}>
          <div className="pol-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{editingId ? 'Chỉnh sửa chính sách' : 'Thêm chính sách'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} disabled={saving}>Đóng</button>
            </header>
            <div className="pol-modal-body">
              <label>
                Tên chính sách
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label>
                Loại chính sách
                <select
                  value={form.policyType}
                  disabled={!!editingId}
                  onChange={(e) => onTypeChange(e.target.value as PolicyType)}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Trạng thái
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PolicyStatus })}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Mô tả
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <label>
                Độ ưu tiên
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="pol-check">
                <input
                  type="checkbox"
                  checked={form.overridesGeneral}
                  onChange={(e) => setForm({ ...form, overridesGeneral: e.target.checked })}
                />
                Ghi đè chính sách chung (dùng cho chính sách theo danh mục)
              </label>

              <h4>Tham số quy định</h4>
              {form.parameters.map((p, idx) => (
                <label key={p.key}>
                  {p.label || p.key}
                  <input
                    value={p.value}
                    onChange={(e) => {
                      const next = [...form.parameters];
                      next[idx] = { ...p, value: e.target.value };
                      setForm({ ...form, parameters: next });
                    }}
                  />
                </label>
              ))}

              <h4>Đối tượng áp dụng</h4>
              {form.targets.map((t, idx) => (
                <div className="pol-target-edit" key={`${idx}-${t.targetType}`}>
                  <input
                    placeholder="Loại (Role/Category/All)"
                    value={t.targetType}
                    onChange={(e) => {
                      const next = [...form.targets];
                      next[idx] = { ...t, targetType: e.target.value };
                      setForm({ ...form, targets: next });
                    }}
                  />
                  <input
                    placeholder="Giá trị"
                    value={t.targetValue}
                    onChange={(e) => {
                      const next = [...form.targets];
                      next[idx] = { ...t, targetValue: e.target.value };
                      setForm({ ...form, targets: next });
                    }}
                  />
                  <input
                    placeholder="Nhãn hiển thị"
                    value={t.targetLabel ?? ''}
                    onChange={(e) => {
                      const next = [...form.targets];
                      next[idx] = { ...t, targetLabel: e.target.value };
                      setForm({ ...form, targets: next });
                    }}
                  />
                </div>
              ))}
            </div>
            <footer>
              <button type="button" className="pol-btn" disabled={saving} onClick={() => setModalOpen(false)}>Hủy</button>
              <button type="button" className="pol-btn pol-btn--primary" disabled={saving} onClick={() => void savePolicy()}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminPoliciesPage;
