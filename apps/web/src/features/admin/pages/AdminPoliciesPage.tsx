import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Eye,
  History,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  DEFAULT_PARAMS,
  STATUS_LABELS,
  TYPE_LABELS,
  buildSummaryCards,
  emptyForm,
  formFromDetail,
  formatDateTime,
  orderedChips,
  paramHint,
  paramKind,
  paramLimits,
  policyHref,
  usePolicyClient,
  validatePolicyForm,
  type ApiResult,
  type FormState,
  type ListResult,
  type PolicyDetail,
  type PolicyStatus,
  type PolicyType,
} from './policyShared';
import './AdminPoliciesPage.css';

type PolicyPageMode = 'list' | 'view' | 'create' | 'edit';

function PolicyList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authHeaders, toast, showToast } = usePolicyClient();
  const [category, setCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const skipSearchEffect = useRef(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (search.trim()) params.set('search', search.trim());
      if (category !== 'All') params.set('type', category);
      if (statusFilter !== 'All') params.set('status', statusFilter);

      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules?${params}`, { headers: authHeaders });
      const json = await parseApiResponse<ApiResult<ListResult>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Không tải được danh sách chính sách.');
      }
      setList(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu.');
      setList(null);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, category, page, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadList]);

  useEffect(() => {
    const message = (location.state as { toast?: string } | null)?.toast;
    if (!message) return;
    showToast(message, 'success');
    navigate('.', { replace: true, state: {} });
  }, [location.state, navigate, showToast]);

  useEffect(() => {
    if (skipSearchEffect.current) {
      skipSearchEffect.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  return (
    <section className="pol-page">
      {toast && <div className={`pol-toast pol-toast--${toast.tone}`}>{toast.message}</div>}

      <nav className="pol-crumb" aria-label="Breadcrumb">
        <Link to="/admin">Quản trị</Link>
        <span>/</span>
        <strong>Quản lý chính sách</strong>
      </nav>

      <header className="pol-heading">
        <div className="pol-heading-copy">
          <div>
            <h1>Quản lý chính sách</h1>
            <p>Cấu hình giới hạn, thời hạn, gia hạn, đặt trước và phí phạt áp dụng khi mượn trả.</p>
          </div>
        </div>
        <button type="button" className="pol-btn pol-btn--primary" onClick={() => navigate('/admin/policies/create')}>
          <Plus size={18} /> Thêm chính sách
        </button>
      </header>

      {list?.categories && (
        <div className="pol-chips" role="tablist" aria-label="Danh mục chính sách">
          {orderedChips(list.categories).filter((chip) => chip.key !== 'General' && chip.key !== 'Violation').map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={category === chip.key ? 'is-active' : ''}
              onClick={() => {
                setCategory(chip.key);
                setPage(1);
              }}
            >
              {chip.label}
              <em>{chip.count}</em>
            </button>
          ))}
        </div>
      )}

      <div className="pol-card">
        <div className="pol-list-toolbar">
          <div className="pol-search">
            <Search size={18} />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo tên, mã hoặc mô tả..."
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
            <option value="Draft">Bản nháp</option>
            <option value="Inactive">Ngừng áp dụng</option>
          </select>
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
                  <th>Danh mục</th>
                  <th>Trạng thái</th>
                  <th>Cập nhật lần cuối</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    onClick={() => navigate(policyHref(item.code))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(policyHref(item.code));
                      }
                    }}
                  >
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.code} · {item.description || 'Không có mô tả'}</small>
                    </td>
                    <td>
                      <span className={`pol-tag pol-tag--${item.policyType}`}>
                        {TYPE_LABELS[item.policyType as PolicyType] ?? item.policyType}
                      </span>
                    </td>
                    <td>
                      <span className={`pol-status pol-status--${item.status}`}>{STATUS_LABELS[item.status]}</span>
                    </td>
                    <td className="pol-muted-cell">{formatDateTime(item.updatedAt || item.createdAt)}</td>
                    <td>
                      <div className="pol-row-actions">
                        <button
                          type="button"
                          className="pol-btn pol-btn--ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(policyHref(item.code));
                          }}
                        >
                          <Eye size={15} /> Xem
                        </button>
                        <button
                          type="button"
                          className="pol-btn pol-btn--ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(policyHref(item.code, '/edit'));
                          }}
                        >
                          <Pencil size={15} /> Sửa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              <button type="button" className="is-active">{page}</button>
              <button type="button" disabled={page >= list.totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

function PolicyView() {
  const { policyCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { authHeaders, toast, showToast } = usePolicyClient();
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [tab, setTab] = useState<'general' | 'rules' | 'targets' | 'history'>('general');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadDetail = useCallback(async (key: string, signal?: AbortSignal) => {
    setLoading(true);
    setNotFound(false);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${encodeURIComponent(key)}`, {
        headers: authHeaders,
        signal,
      });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (signal?.aborted) return;
      if (res.status === 404 || !json?.success || !json.data) {
        setDetail(null);
        setNotFound(true);
        return;
      }
      setDetail(json.data);
      if (json.data.code && key.toLowerCase() !== json.data.code.toLowerCase()) {
        navigate(policyHref(json.data.code), { replace: true });
      }
    } catch (err) {
      if (signal?.aborted) return;
      setDetail(null);
      setError(err instanceof Error ? err.message : 'Không tải được chi tiết chính sách.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authHeaders, navigate]);

  useEffect(() => {
    if (!policyCode) {
      const timer = window.setTimeout(() => {
        setNotFound(true);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadDetail(policyCode, controller.signal);
      setMenuOpen(false);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [policyCode, loadDetail]);

  useEffect(() => {
    const state = location.state as { toast?: string; tab?: 'general' | 'rules' } | null;
    if (!state?.toast && state?.tab !== 'rules') return;
    if (state.tab === 'rules') setTab('rules');
    if (state.toast) showToast(state.toast, 'success');
    navigate('.', { replace: true, state: {} });
  }, [location.state, navigate, showToast]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const changeStatus = async (status: PolicyStatus) => {
    if (!detail) return;
    if (!window.confirm(`Bạn chắc chắn muốn chuyển trạng thái sang "${STATUS_LABELS[status]}"?`)) return;
    setMenuOpen(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${encodeURIComponent(detail.code)}/status`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ status }),
      });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.error || 'Đổi trạng thái thất bại.');
      setDetail(json.data);
      showToast('Đã cập nhật trạng thái.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi đổi trạng thái.', 'error');
    }
  };

  const deletePolicy = async () => {
    if (!detail) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${encodeURIComponent(detail.code)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const json = await parseApiResponse<ApiResult<boolean>>(res);
      if (!res.ok || json?.success === false) throw new Error(json?.error || 'Xóa chính sách thất bại.');
      navigate('/admin/policies', { state: { toast: `Đã xóa chính sách ${detail.code}.` } });
    } catch (err) {
      setDeleting(false);
      setConfirmDelete(false);
      showToast(err instanceof Error ? err.message : 'Lỗi xóa chính sách.', 'error');
    }
  };

  const summaryCards = detail ? buildSummaryCards(detail.parameters) : [];

  return (
    <section className="pol-page">
      {toast && <div className={`pol-toast pol-toast--${toast.tone}`}>{toast.message}</div>}
      <nav className="pol-crumb" aria-label="Breadcrumb">
        <Link to="/admin">Quản trị</Link>
        <span>/</span>
        <Link to="/admin/policies">Quản lý chính sách</Link>
        <span>/</span>
        <strong>Chi tiết chính sách</strong>
      </nav>
      {loading ? (
        <div className="pol-card pol-empty"><LoaderCircle className="spin" size={22} /> Đang tải chi tiết...</div>
      ) : error ? (
        <div className="pol-card pol-empty pol-empty--error">{error}</div>
      ) : notFound || !detail ? (
        <div className="pol-card pol-empty pol-empty--error">
          Không tìm thấy chính sách
          <button type="button" className="pol-btn" onClick={() => navigate('/admin/policies')}>Quay lại danh sách</button>
        </div>
      ) : (
        <div className="pol-card pol-detail">
          <div className="pol-detail-head">
            <div className="pol-detail-title">
              <div className="pol-detail-meta">
                <span className="pol-code">{detail.code}</span>
                <span className={`pol-status pol-status--${detail.status}`}>{STATUS_LABELS[detail.status]}</span>
              </div>
              <h1>{detail.name}</h1>
              <p>{detail.description || 'Không có mô tả.'}</p>
            </div>
            <div className="pol-detail-actions">
              <button type="button" className="pol-btn" onClick={() => navigate('/admin/policies')}><ArrowLeft size={16} /> Quay lại danh sách</button>
              <button type="button" className="pol-btn pol-btn--outline" onClick={() => navigate(policyHref(detail.code, '/edit'))}><Pencil size={16} /> Chỉnh sửa</button>
              <button type="button" className="pol-btn pol-btn--danger" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}><Trash2 size={16} /> Xóa</button>
              <div className="pol-menu" ref={menuRef}>
                <button type="button" className="pol-icon-btn" aria-label="Thao tác khác" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={18} /></button>
                {menuOpen && (
                  <div className="pol-menu-list" role="menu">
                    {detail.status !== 'Active' && <button type="button" onClick={() => void changeStatus('Active')}><ShieldCheck size={15} /> Kích hoạt</button>}
                    {detail.status === 'Active' && <button type="button" onClick={() => void changeStatus('Inactive')}><Ban size={15} /> Ngừng áp dụng</button>}
                    {detail.status !== 'Draft' && <button type="button" onClick={() => void changeStatus('Draft')}>Đưa về nháp</button>}
                    <button type="button" className="pol-danger" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}><Trash2 size={15} /> Xóa chính sách</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {summaryCards.length > 0 && (
            <>
              <h2 className="pol-section-title">Giá trị cấu hình</h2>
              <div className="pol-metrics">
                {summaryCards.map((card) => (
                  <article key={`${card.label}-${card.value}`}>
                    <strong>{card.value}{card.unit ? <span> {card.unit}</span> : null}</strong>
                    <small>{card.label}</small>
                  </article>
                ))}
              </div>
            </>
          )}
          <div className="pol-tabs">
            <button type="button" className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>Thông tin chung</button>
            <button type="button" className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>Cấu hình & lưu ý</button>
            <button type="button" className={tab === 'targets' ? 'active' : ''} onClick={() => setTab('targets')}>Đối tượng áp dụng</button>
            <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Lịch sử thay đổi</button>
          </div>
          <div className="pol-detail-body">
            {tab === 'general' && (
              <dl className="pol-facts">
                <div><dt>Mã chính sách</dt><dd>{detail.code}</dd></div>
                <div><dt>Loại chính sách</dt><dd>{TYPE_LABELS[detail.policyType]}</dd></div>
                <div><dt>Trạng thái</dt><dd>{STATUS_LABELS[detail.status]}</dd></div>
                <div><dt>Ngày tạo</dt><dd>{formatDateTime(detail.createdAt)}</dd></div>
                <div><dt>Người tạo</dt><dd>{detail.createdByName || 'Hệ thống / Admin'}</dd></div>
                <div><dt>Cập nhật lần cuối</dt><dd>{formatDateTime(detail.updatedAt)}</dd></div>
              </dl>
            )}
            {tab === 'rules' && (
              <div className="pol-rules">
                {detail.parameters.length === 0 ? <p className="pol-muted">Chưa có tham số cấu hình.</p> : detail.parameters.map((p) => (
                  <div key={p.key} className="pol-rule-row"><span>{p.label || p.key}</span><strong>{p.value || '—'}</strong></div>
                ))}
              </div>
            )}
            {tab === 'targets' && (
              <div className="pol-targets">
                {detail.targets.length === 0 ? <p className="pol-muted">Chưa gán đối tượng áp dụng.</p> : detail.targets.map((t, idx) => (
                  <div key={`${t.targetType}-${t.targetValue}-${idx}`} className="pol-target-row">
                    <Users size={16} />
                    <div><strong>{t.targetLabel || t.targetValue}</strong><small>{t.targetType}: {t.targetValue}</small></div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'history' && (
              <div className="pol-history">
                {detail.histories.length === 0 ? <p className="pol-muted">Chưa có lịch sử thay đổi.</p> : detail.histories.map((h) => (
                  <div key={h.id} className="pol-history-row">
                    <History size={16} />
                    <div><strong>{h.changeSummary}</strong><small>{h.changedByName || 'Hệ thống'} · {formatDateTime(h.createdAt)}</small></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {confirmDelete && detail && (
        <div className="pol-confirm-scrim" role="presentation" onClick={() => { if (!deleting) setConfirmDelete(false); }}>
          <div className="pol-confirm" role="dialog" aria-labelledby="pol-delete-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="pol-delete-title">Xóa chính sách?</h3>
            <p>Bạn sắp xóa <strong>{detail.name}</strong> ({detail.code}). Chính sách sẽ không còn xuất hiện trong danh sách.</p>
            <footer>
              <button type="button" className="pol-btn" disabled={deleting} onClick={() => setConfirmDelete(false)}>Hủy</button>
              <button type="button" className="pol-btn pol-btn--danger-solid" disabled={deleting} onClick={() => void deletePolicy()}>{deleting ? 'Đang xóa...' : 'Xóa chính sách'}</button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

function PolicyForm({ mode }: { mode: 'create' | 'edit' }) {
  const { policyCode } = useParams();
  const navigate = useNavigate();
  const { authHeaders, toast, showToast } = usePolicyClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async (key: string, signal?: AbortSignal) => {
    setLoading(true);
    setNotFound(false);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${encodeURIComponent(key)}`, {
        headers: authHeaders,
        signal,
      });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (signal?.aborted) return;
      if (res.status === 404 || !json?.success || !json.data) {
        setNotFound(true);
        return;
      }
      setForm(formFromDetail(json.data));
      if (json.data.code && key.toLowerCase() !== json.data.code.toLowerCase()) {
        navigate(policyHref(json.data.code, '/edit'), { replace: true });
      }
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Không tải được chính sách.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authHeaders, navigate]);

  useEffect(() => {
    if (mode !== 'edit' || !policyCode) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadDetail(policyCode, controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, policyCode, loadDetail]);

  const onTypeChange = (policyType: PolicyType) => {
    setForm((prev) => ({
      ...prev,
      policyType,
      priority: policyType === 'CategoryOverride' ? 100 : prev.priority || 10,
      overridesGeneral: policyType === 'CategoryOverride',
      parameters: DEFAULT_PARAMS[policyType].map((p) => {
        const existing = prev.parameters.find((x) => x.key === p.key);
        return existing ? { ...p, value: existing.value } : { ...p };
      }),
    }));
  };

  const persist = async (status: PolicyStatus) => {
    const validationError = validatePolicyForm({ ...form, status });
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }
    setSaving(true);
    try {
      const url = mode === 'edit' && policyCode
        ? `${API_BASE_URL}/api/v1/policy-rules/${encodeURIComponent(policyCode)}`
        : `${API_BASE_URL}/api/v1/policy-rules`;
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          policyType: form.policyType,
          status,
          priority: form.priority,
          overridesGeneral: form.overridesGeneral,
          parameters: form.parameters.map((parameter) => ({
            key: parameter.key,
            value: parameter.value.trim(),
            label: parameter.label ?? null,
          })),
          targets: form.targets,
        }),
      });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.error || 'Lưu chính sách thất bại.');
      navigate(policyHref(json.data.code), {
        state: {
          toast: 'Đã lưu chính sách. Giá trị mới sẽ áp dụng cho lượt mượn và phí phạt tiếp theo.',
          tab: 'rules',
        },
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi lưu chính sách.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (mode === 'edit' && policyCode) navigate(policyHref(policyCode));
    else navigate('/admin/policies');
  };

  const setParam = (idx: number, value: string) => {
    const next = [...form.parameters];
    next[idx] = { ...next[idx], value };
    setForm({ ...form, parameters: next });
  };

  const setTarget = (idx: number, patch: Partial<FormState['targets'][number]>) => {
    const next = [...form.targets];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, targets: next });
  };

  return (
    <section className="pol-page">
      {toast && <div className={`pol-toast pol-toast--${toast.tone}`}>{toast.message}</div>}
      <nav className="pol-crumb" aria-label="Breadcrumb">
        <Link to="/admin">Quản trị</Link>
        <span>/</span>
        <Link to="/admin/policies">Quản lý chính sách</Link>
        <span>/</span>
        <strong>{mode === 'edit' ? 'Chỉnh sửa' : 'Thêm chính sách'}</strong>
      </nav>
      {loading ? (
        <div className="pol-card pol-empty"><LoaderCircle className="spin" size={22} /> Đang tải biểu mẫu...</div>
      ) : error ? (
        <div className="pol-card pol-empty pol-empty--error">{error}</div>
      ) : notFound ? (
        <div className="pol-card pol-empty pol-empty--error">
          Không tìm thấy chính sách
          <button type="button" className="pol-btn" onClick={() => navigate('/admin/policies')}>Quay lại danh sách</button>
        </div>
      ) : (
        <div className="pol-card pol-form">
          <header className="pol-form-head">
            <div>
              <h1>{mode === 'edit' ? 'Chỉnh sửa chính sách' : 'Thêm chính sách'}</h1>
              <p>{mode === 'edit' ? `Sửa số ngày, mức phí rồi bấm Lưu thay đổi. Dữ liệu được ghi vào database và dùng cho lượt mượn mới.` : 'Nhập số ngày mượn, mức phí hoặc hạn mức tương ứng danh mục đã chọn.'}</p>
            </div>
            <button type="button" className="pol-btn" onClick={cancel} disabled={saving}><ArrowLeft size={16} /> Hủy</button>
          </header>
          <div className="pol-form-grid">
            <label>Tên chính sách<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>
              Danh mục chính sách
              <select value={form.policyType} disabled={mode === 'edit'} onChange={(e) => onTypeChange(e.target.value as PolicyType)}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            {mode === 'edit' && (
              <label>
                Trạng thái
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PolicyStatus })}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            )}
            <label className="pol-form-wide">Mô tả / lưu ý<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </div>
          <h2 className="pol-section-title">Cấu hình chính sách · {TYPE_LABELS[form.policyType]}</h2>
          <div className="pol-form-grid">
            {form.parameters.map((p, idx) => {
              const kind = paramKind(p.key);
              const limits = paramLimits(p.key);
              const hint = paramHint(p.key);
              return (
                <label key={p.key}>
                  {p.label || p.key}
                  {kind === 'boolean' ? (
                    <select value={p.value} onChange={(e) => setParam(idx, e.target.value)}>
                      <option value="">Chưa đặt</option>
                      <option value="true">Có</option>
                      <option value="false">Không</option>
                    </select>
                  ) : kind === 'integer' ? (
                    <input
                      type="number"
                      inputMode="numeric"
                      min={limits.min}
                      max={limits.max}
                      step={1}
                      value={p.value}
                      placeholder="Nhập số nguyên dương"
                      onChange={(e) => setParam(idx, e.target.value)}
                    />
                  ) : (
                    <input value={p.value} onChange={(e) => setParam(idx, e.target.value)} />
                  )}
                  {hint ? <span className="pol-field-hint">{hint}</span> : null}
                </label>
              );
            })}
          </div>
          <h2 className="pol-section-title">Đối tượng áp dụng</h2>
          {form.targets.map((t, idx) => (
            <div className="pol-target-edit" key={`${idx}-${t.targetType}`}>
              <input placeholder="Loại (Role/Category/All)" value={t.targetType} onChange={(e) => setTarget(idx, { targetType: e.target.value })} />
              <input placeholder="Giá trị" value={t.targetValue} onChange={(e) => setTarget(idx, { targetValue: e.target.value })} />
              <input placeholder="Nhãn hiển thị" value={t.targetLabel ?? ''} onChange={(e) => setTarget(idx, { targetLabel: e.target.value })} />
            </div>
          ))}
          <footer className="pol-form-actions">
            <button type="button" className="pol-btn" disabled={saving} onClick={cancel}>Hủy</button>
            {mode === 'create' ? (
              <>
                <button type="button" className="pol-btn" disabled={saving} onClick={() => void persist('Draft')}>{saving ? 'Đang lưu...' : 'Lưu bản nháp'}</button>
                <button type="button" className="pol-btn pol-btn--primary" disabled={saving} onClick={() => void persist('Active')}>{saving ? 'Đang lưu...' : 'Tạo chính sách'}</button>
              </>
            ) : (
              <button type="button" className="pol-btn pol-btn--primary" disabled={saving} onClick={() => void persist(form.status)}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
            )}
          </footer>
        </div>
      )}
    </section>
  );
}

const AdminPoliciesPage: React.FC<{ mode?: PolicyPageMode }> = ({ mode = 'list' }) => {
  if (mode === 'view') return <PolicyView />;
  if (mode === 'create' || mode === 'edit') return <PolicyForm mode={mode} />;
  return <PolicyList />;
};

export default AdminPoliciesPage;
