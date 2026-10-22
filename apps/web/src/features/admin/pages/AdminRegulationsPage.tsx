import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
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
  CATEGORY_ICONS,
  DEFAULT_PARAMS,
  STATUS_LABELS,
  TYPE_LABELS,
  bodyLines,
  emptyForm,
  formFromDetail,
  formatDateShort,
  formatDateTime,
  getParam,
  regulationHref,
  useRegulationClient,
  type ApiResult,
  type FormState,
  type ListResult,
  type RegulationDetail,
  type RegulationStatus,
  type RegulationType,
} from './regulationShared';
import './AdminRegulationsPage.css';

type RegulationPageMode = 'list' | 'view' | 'create' | 'edit';

function RegulationList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authHeaders, toast, showToast } = useRegulationClient();
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
      const params = new URLSearchParams({ page: String(page), pageSize: '8' });
      if (search.trim()) params.set('search', search.trim());
      if (category !== 'All') params.set('type', category);
      if (statusFilter !== 'All') params.set('status', statusFilter);

      const res = await fetch(`${API_BASE_URL}/api/v1/regulations?${params}`, { headers: authHeaders });
      const json = await parseApiResponse<ApiResult<ListResult>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Không tải được danh sách quy định.');
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
    <section className="reg-page">
      {toast && <div className={`reg-toast reg-toast--${toast.tone}`}>{toast.message}</div>}

      <nav className="reg-crumb" aria-label="Breadcrumb">
        <Link to="/admin">Quản trị</Link>
        <span>/</span>
        <strong>Quản lý quy định</strong>
      </nav>

      <header className="reg-heading">
        <div className="reg-heading-copy">
          <div className="reg-heading-icon"><ShieldCheck size={24} /></div>
          <div>
            <h1>Quy định thư viện</h1>
            <p>Nội quy tham khảo. Chỉ công bố sau khi Admin xác nhận tại FPT TP.HCM.</p>
          </div>
        </div>
        <button type="button" className="reg-btn reg-btn--primary" onClick={() => navigate('/admin/regulations/create')}>
          <Plus size={18} /> Thêm quy định
        </button>
      </header>

      <div className="reg-filters">
        <div className="reg-search">
          <Search size={18} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo mã hoặc tên quy định"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="All">Tất cả danh mục</option>
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="All">Tất cả trạng thái</option>
          <option value="Draft">Bản nháp</option>
          <option value="PendingReview">Chờ xác nhận</option>
          <option value="Active">Đã duyệt</option>
          <option value="Inactive">Ngừng áp dụng</option>
        </select>
      </div>

      <div className="reg-card">
        {loading ? (
          <div className="reg-empty"><LoaderCircle className="spin" size={22} /> Đang tải...</div>
        ) : error ? (
          <div className="reg-empty reg-empty--error">{error}</div>
        ) : !list?.items.length ? (
          <div className="reg-empty">Không có quy định phù hợp.</div>
        ) : (
          <div className="reg-table-wrap">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên quy định</th>
                  <th>Danh mục</th>
                  <th>Trạng thái</th>
                  <th>Ngày cập nhật</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => {
                  const Icon = CATEGORY_ICONS[item.policyType] ?? FileText;
                  return (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      onClick={() => navigate(regulationHref(item.code))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(regulationHref(item.code));
                        }
                      }}
                    >
                      <td><span className="reg-code">{item.code}</span></td>
                      <td>
                        <div className="reg-name-cell">
                          <span className={`reg-row-icon reg-row-icon--${item.policyType}`}>
                            <Icon size={16} />
                          </span>
                          <strong>{item.name}</strong>
                        </div>
                      </td>
                      <td>
                        <span className={`reg-tag reg-tag--${item.policyType}`}>
                          {TYPE_LABELS[item.policyType] ?? item.policyType}
                        </span>
                      </td>
                      <td>
                        <span className={`reg-status reg-status--${item.status}`}>{STATUS_LABELS[item.status]}</span>
                      </td>
                      <td className="reg-updated-cell">{formatDateShort(item.updatedAt || item.createdAt)}</td>
                      <td>
                        <div className="reg-row-actions">
                          <button
                            type="button"
                            className="reg-btn reg-btn--ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(regulationHref(item.code));
                            }}
                          >
                            <Eye size={15} /> Xem
                          </button>
                          <button
                            type="button"
                            className="reg-btn reg-btn--ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(regulationHref(item.code, '/edit'));
                            }}
                          >
                            <Pencil size={15} /> Sửa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {list && list.totalCount > 0 && (
          <div className="reg-pagination">
            <span>
              {(list.page - 1) * list.pageSize + 1}
              –
              {Math.min(list.page * list.pageSize, list.totalCount)} / {list.totalCount}
            </span>
            <div>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Trước">
                <ChevronLeft size={16} />
              </button>
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
              <button type="button" disabled={page >= list.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Sau">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

function RegulationView() {
  const { regulationId } = useParams();
  const navigate = useNavigate();
  const { authHeaders, toast, showToast } = useRegulationClient();
  const [detail, setDetail] = useState<RegulationDetail | null>(null);
  const [tab, setTab] = useState<'content' | 'targets' | 'history'>('content');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadDetail = useCallback(async (key: string) => {
    setLoading(true);
    setNotFound(false);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/regulations/${encodeURIComponent(key)}`, { headers: authHeaders });
      const json = await parseApiResponse<ApiResult<RegulationDetail>>(res);
      if (res.status === 404 || !json?.success || !json.data) {
        setDetail(null);
        setNotFound(true);
        return;
      }
      setDetail(json.data);
      if (json.data.code && key.toLowerCase() !== json.data.code.toLowerCase()) {
        navigate(regulationHref(json.data.code), { replace: true });
      }
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : 'Không tải được chi tiết quy định.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, navigate]);

  useEffect(() => {
    if (!regulationId) {
      const timer = window.setTimeout(() => { setNotFound(true); setLoading(false); }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      void loadDetail(regulationId);
      setTab('content');
      setMenuOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [regulationId, loadDetail]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const changeStatus = async (status: RegulationStatus) => {
    if (!detail) return;
    if (!window.confirm(`Chuyển trạng thái sang "${STATUS_LABELS[status]}"?`)) return;
    setMenuOpen(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/regulations/${encodeURIComponent(detail.code)}/status`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ status }),
      });
      const json = await parseApiResponse<ApiResult<RegulationDetail>>(res);
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.error || 'Đổi trạng thái thất bại.');
      setDetail(json.data);
      showToast('Đã cập nhật trạng thái.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi đổi trạng thái.', 'error');
    }
  };

  const deleteRegulation = async () => {
    if (!detail) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/regulations/${encodeURIComponent(detail.code)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const json = await parseApiResponse<ApiResult<boolean>>(res);
      if (!res.ok || json?.success === false) throw new Error(json?.error || 'Xóa quy định thất bại.');
      navigate('/admin/regulations', { state: { toast: `Đã xóa quy định ${detail.code}.` } });
    } catch (err) {
      setDeleting(false);
      setConfirmDelete(false);
      showToast(err instanceof Error ? err.message : 'Lỗi xóa quy định.', 'error');
    }
  };

  const sourceUrl = detail ? getParam(detail.parameters, 'source_url') : '';
  const sourceLabel = detail ? getParam(detail.parameters, 'source_label') : '';
  const campusNote = detail ? getParam(detail.parameters, 'campus_note') : '';
  const extraParams = (detail?.parameters ?? []).filter((p) => !['source_url', 'source_label', 'campus_note'].includes(p.key));
  const pending = detail?.status === 'Draft' || detail?.status === 'PendingReview';

  return (
    <section className="reg-page">
      {toast && <div className={`reg-toast reg-toast--${toast.tone}`}>{toast.message}</div>}
      <nav className="reg-crumb" aria-label="Breadcrumb">
        <Link to="/admin">Quản trị</Link>
        <span>/</span>
        <Link to="/admin/regulations">Quản lý quy định</Link>
        <span>/</span>
        <strong>Chi tiết</strong>
      </nav>
      {loading ? (
        <div className="reg-card reg-empty"><LoaderCircle className="spin" size={22} /> Đang tải chi tiết...</div>
      ) : error ? (
        <div className="reg-card reg-empty reg-empty--error">{error}</div>
      ) : notFound || !detail ? (
        <div className="reg-card reg-empty reg-empty--error">
          Không tìm thấy quy định
          <button type="button" className="reg-btn" onClick={() => navigate('/admin/regulations')}>Quay lại danh sách</button>
        </div>
      ) : (
        <div className="reg-card reg-detail">
          <div className="reg-detail-head">
            <div className="reg-detail-title">
              <div className="reg-detail-meta">
                <span className="reg-code">{detail.code}</span>
                <span className={`reg-tag reg-tag--${detail.policyType}`}>{TYPE_LABELS[detail.policyType]}</span>
                <span className={`reg-status reg-status--${detail.status}`}>{STATUS_LABELS[detail.status]}</span>
              </div>
              <h1>{detail.name}</h1>
              {pending && <p className="reg-verify-banner">Nguồn FPTU Hà Nội — chờ Admin xác nhận trước khi công bố tại FPT TP.HCM.</p>}
            </div>
            <div className="reg-detail-actions">
              <button type="button" className="reg-btn" onClick={() => navigate('/admin/regulations')}><ArrowLeft size={16} /> Quay lại</button>
              <button type="button" className="reg-btn reg-btn--outline" onClick={() => navigate(regulationHref(detail.code, '/edit'))}><Pencil size={16} /> Chỉnh sửa</button>
              <div className="reg-menu" ref={menuRef}>
                <button type="button" className="reg-icon-btn" aria-label="Thao tác khác" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={18} /></button>
                {menuOpen && (
                  <div className="reg-menu-list" role="menu">
                    {detail.status !== 'PendingReview' && detail.status !== 'Active' && (
                      <button type="button" onClick={() => void changeStatus('PendingReview')}>Gửi chờ xác nhận</button>
                    )}
                    {detail.status !== 'Active' && <button type="button" onClick={() => void changeStatus('Active')}><ShieldCheck size={15} /> Duyệt và công bố</button>}
                    {detail.status === 'Active' && <button type="button" onClick={() => void changeStatus('Inactive')}><Ban size={15} /> Ngừng áp dụng</button>}
                    {detail.status !== 'Draft' && <button type="button" onClick={() => void changeStatus('Draft')}>Đưa về bản nháp</button>}
                    <button type="button" className="reg-danger" onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}><Trash2 size={15} /> Xóa quy định</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="reg-tabs">
            <button type="button" className={tab === 'content' ? 'active' : ''} onClick={() => setTab('content')}>Nội dung</button>
            <button type="button" className={tab === 'targets' ? 'active' : ''} onClick={() => setTab('targets')}>Đối tượng</button>
            <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Lịch sử</button>
          </div>
          {tab === 'content' && (
            <div className="reg-content">
              <ul className="reg-body">{bodyLines(detail.description).map((line) => <li key={line}>{line}</li>)}</ul>
              {extraParams.length > 0 && (
                <div className="reg-ref-values">
                  {extraParams.map((p) => (
                    <div key={p.key} className="reg-rule-row"><span>{p.label || p.key}</span><strong>{p.value || '—'}</strong></div>
                  ))}
                </div>
              )}
              <dl className="reg-facts">
                <div><dt>Nguồn tham khảo</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{sourceLabel || sourceUrl}</a> : (sourceLabel || '—')}</dd></div>
                <div><dt>Ngày cập nhật</dt><dd>{formatDateTime(detail.updatedAt)}</dd></div>
                <div><dt>Người cập nhật</dt><dd>{detail.updatedByName || 'Hệ thống'}</dd></div>
                <div className="reg-facts-wide"><dt>Ghi chú xác minh tại campus</dt><dd>{campusNote || '—'}</dd></div>
              </dl>
            </div>
          )}
          {tab === 'targets' && (
            <div>
              {detail.targets.length === 0 ? <p className="reg-muted">Chưa gán đối tượng áp dụng.</p> : detail.targets.map((t, idx) => (
                <div key={`${t.targetType}-${t.targetValue}-${idx}`} className="reg-target-row">
                  <Users size={16} />
                  <div><strong>{t.targetLabel || t.targetValue}</strong><small>{t.targetType}: {t.targetValue}</small></div>
                </div>
              ))}
            </div>
          )}
          {tab === 'history' && (
            <div>
              {detail.histories.length === 0 ? <p className="reg-muted">Chưa có lịch sử thay đổi.</p> : detail.histories.map((h) => (
                <div key={h.id} className="reg-history-row">
                  <History size={16} />
                  <div><strong>{h.changeSummary}</strong><small>{h.changedByName || 'Hệ thống'} · {formatDateTime(h.createdAt)}</small></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {confirmDelete && detail && (
        <div className="reg-confirm-scrim" role="presentation" onClick={() => { if (!deleting) setConfirmDelete(false); }}>
          <div className="reg-confirm" role="dialog" aria-labelledby="reg-delete-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="reg-delete-title">Xóa quy định?</h3>
            <p>Bạn sắp xóa <strong>{detail.name}</strong> ({detail.code}).</p>
            <footer>
              <button type="button" className="reg-btn" disabled={deleting} onClick={() => setConfirmDelete(false)}>Hủy</button>
              <button type="button" className="reg-btn reg-btn--danger-solid" disabled={deleting} onClick={() => void deleteRegulation()}>{deleting ? 'Đang xóa...' : 'Xóa quy định'}</button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

function RegulationForm({ mode }: { mode: 'create' | 'edit' }) {
  const { regulationId } = useParams();
  const navigate = useNavigate();
  const { authHeaders, toast, showToast } = useRegulationClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async (key: string) => {
    setLoading(true);
    setNotFound(false);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/regulations/${encodeURIComponent(key)}`, { headers: authHeaders });
      const json = await parseApiResponse<ApiResult<RegulationDetail>>(res);
      if (res.status === 404 || !json?.success || !json.data) {
        setNotFound(true);
        return;
      }
      setForm(formFromDetail(json.data));
      if (json.data.code && key.toLowerCase() !== json.data.code.toLowerCase()) {
        navigate(regulationHref(json.data.code, '/edit'), { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được quy định.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, navigate]);

  useEffect(() => {
    if (mode !== 'edit' || !regulationId) return undefined;
    const timer = window.setTimeout(() => { void loadDetail(regulationId); }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, regulationId, loadDetail]);

  const onTypeChange = (policyType: RegulationType) => {
    setForm((prev) => ({
      ...prev,
      policyType,
      priority: prev.priority || 10,
      overridesGeneral: false,
      parameters: DEFAULT_PARAMS[policyType].map((p) => {
        const existing = prev.parameters.find((x) => x.key === p.key);
        return existing ? { ...p, value: existing.value } : { ...p };
      }),
    }));
  };

  const persist = async (status: RegulationStatus) => {
    if (!form.name.trim()) {
      showToast('Vui lòng nhập tên quy định.', 'error');
      return;
    }
    setSaving(true);
    try {
      const url = mode === 'edit' && regulationId
        ? `${API_BASE_URL}/api/v1/regulations/${encodeURIComponent(regulationId)}`
        : `${API_BASE_URL}/api/v1/regulations`;
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
          parameters: form.parameters.filter((p) => p.key.trim()),
          targets: form.targets,
        }),
      });
      const json = await parseApiResponse<ApiResult<RegulationDetail>>(res);
      if (!res.ok || !json?.success || !json.data) throw new Error(json?.error || 'Lưu quy định thất bại.');
      navigate(regulationHref(json.data.code));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi lưu quy định.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (mode === 'edit' && regulationId) navigate(regulationHref(regulationId));
    else navigate('/admin/regulations');
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
    <section className="reg-page">
      {toast && <div className={`reg-toast reg-toast--${toast.tone}`}>{toast.message}</div>}
      <nav className="reg-crumb" aria-label="Breadcrumb">
        <Link to="/admin">Quản trị</Link>
        <span>/</span>
        <Link to="/admin/regulations">Quản lý quy định</Link>
        <span>/</span>
        <strong>{mode === 'edit' ? 'Chỉnh sửa' : 'Thêm quy định'}</strong>
      </nav>
      {loading ? (
        <div className="reg-card reg-empty"><LoaderCircle className="spin" size={22} /> Đang tải biểu mẫu...</div>
      ) : error ? (
        <div className="reg-card reg-empty reg-empty--error">{error}</div>
      ) : notFound ? (
        <div className="reg-card reg-empty reg-empty--error">
          Không tìm thấy quy định
          <button type="button" className="reg-btn" onClick={() => navigate('/admin/regulations')}>Quay lại danh sách</button>
        </div>
      ) : (
        <div className="reg-card reg-form">
          <header className="reg-form-head">
            <div>
              <h1>{mode === 'edit' ? 'Chỉnh sửa quy định' : 'Thêm quy định'}</h1>
              <p>{mode === 'edit' ? 'Chỉnh sửa nội dung tham khảo. Chỉ công bố sau khi Admin xác nhận tại FPT TP.HCM.' : 'Nhập nội quy tham khảo. Bản mới được lưu ở trạng thái bản nháp, chưa công bố tại FPT TP.HCM.'}</p>
            </div>
            <button type="button" className="reg-btn" onClick={cancel} disabled={saving}><ArrowLeft size={16} /> Hủy</button>
          </header>
          <div className="reg-form-grid">
            <label>Tên quy định<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>
              Danh mục
              <select value={form.policyType} disabled={mode === 'edit'} onChange={(e) => onTypeChange(e.target.value as RegulationType)}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            {mode === 'edit' && (
              <label>
                Trạng thái
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RegulationStatus })}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            )}
            <label className="reg-form-wide">Nội dung quy định<textarea rows={8} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mỗi ý một dòng" /></label>
          </div>
          <h2 className="reg-section-title">Nguồn tham khảo và xác minh campus</h2>
          <div className="reg-form-grid">
            {form.parameters.map((p, idx) => (
              <label key={p.key} className={p.key === 'campus_note' ? 'reg-form-wide' : undefined}>
                {p.label || p.key}
                {p.key === 'campus_note'
                  ? <textarea rows={3} value={p.value} onChange={(e) => setParam(idx, e.target.value)} />
                  : <input value={p.value} onChange={(e) => setParam(idx, e.target.value)} />}
              </label>
            ))}
          </div>
          <h2 className="reg-section-title">Đối tượng áp dụng</h2>
          {form.targets.map((t, idx) => (
            <div className="reg-target-edit" key={`${idx}-${t.targetType}`}>
              <input placeholder="Loại (Role/Category/All)" value={t.targetType} onChange={(e) => setTarget(idx, { targetType: e.target.value })} />
              <input placeholder="Giá trị" value={t.targetValue} onChange={(e) => setTarget(idx, { targetValue: e.target.value })} />
              <input placeholder="Nhãn hiển thị" value={t.targetLabel ?? ''} onChange={(e) => setTarget(idx, { targetLabel: e.target.value })} />
            </div>
          ))}
          <footer className="reg-form-actions">
            <button type="button" className="reg-btn" disabled={saving} onClick={cancel}>Hủy</button>
            {mode === 'create'
              ? <button type="button" className="reg-btn reg-btn--primary" disabled={saving} onClick={() => void persist('Draft')}>{saving ? 'Đang lưu...' : 'Lưu bản nháp'}</button>
              : <button type="button" className="reg-btn reg-btn--primary" disabled={saving} onClick={() => void persist(form.status)}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>}
          </footer>
        </div>
      )}
    </section>
  );
}

const AdminRegulationsPage: React.FC<{ mode?: RegulationPageMode }> = ({ mode = 'list' }) => {
  if (mode === 'view') return <RegulationView />;
  if (mode === 'create' || mode === 'edit') return <RegulationForm mode={mode} />;
  return <RegulationList />;
};

export default AdminRegulationsPage;
