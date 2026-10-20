import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  CATEGORY_ICONS,
  formatDateShort,
  regulationHref,
  STATUS_LABELS,
  TYPE_LABELS,
  useRegulationClient,
  type ApiResult,
  type ListResult,
} from '../regulations/regulationShared';
import './AdminRegulationsPage.css';

const AdminRegulationsPage: React.FC = () => {
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

export default AdminRegulationsPage;
