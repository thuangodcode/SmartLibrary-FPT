import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, LoaderCircle, Pencil, Plus, Search, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  formatDateTime,
  orderedChips,
  policyHref,
  STATUS_LABELS,
  TYPE_LABELS,
  usePolicyClient,
  type ApiResult,
  type ListResult,
  type PolicyType,
} from '../policies/policyShared';
import './AdminPoliciesPage.css';

const AdminPoliciesPage: React.FC = () => {
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
          <div className="pol-heading-icon"><ShieldCheck size={26} /></div>
          <div>
            <h1>Quản lý chính sách thư viện</h1>
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

export default AdminPoliciesPage;
