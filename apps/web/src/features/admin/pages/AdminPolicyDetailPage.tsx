import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  History,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  buildSummaryCards,
  formatDateTime,
  policyHref,
  STATUS_LABELS,
  TYPE_LABELS,
  usePolicyClient,
  type ApiResult,
  type PolicyDetail,
  type PolicyStatus,
} from '../policies/policyShared';
import './AdminPoliciesPage.css';

const AdminPolicyDetailPage: React.FC = () => {
  const { policyCode } = useParams();
  const navigate = useNavigate();
  const { authHeaders, toast, showToast } = usePolicyClient();
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [detailTab, setDetailTab] = useState<'general' | 'rules' | 'targets' | 'history'>('general');
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
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${encodeURIComponent(key)}`, { headers: authHeaders });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
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
      setDetail(null);
      setError(err instanceof Error ? err.message : 'Không tải được chi tiết chính sách.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, navigate]);

  useEffect(() => {
    if (!policyCode) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    void loadDetail(policyCode);
    setDetailTab('general');
    setMenuOpen(false);
  }, [policyCode, loadDetail]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const changeStatus = async (status: PolicyStatus) => {
    if (!detail) return;
    const label = STATUS_LABELS[status];
    if (!window.confirm(`Bạn chắc chắn muốn chuyển trạng thái sang "${label}"?`)) return;
    setMenuOpen(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${encodeURIComponent(detail.code)}/status`, {
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
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || 'Xóa chính sách thất bại.');
      }
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
          <button type="button" className="pol-btn" onClick={() => navigate('/admin/policies')}>
            Quay lại danh sách
          </button>
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
              <button type="button" className="pol-btn" onClick={() => navigate('/admin/policies')}>
                <ArrowLeft size={16} /> Quay lại danh sách
              </button>
              <button type="button" className="pol-btn pol-btn--outline" onClick={() => navigate(policyHref(detail.code, '/edit'))}>
                <Pencil size={16} /> Chỉnh sửa
              </button>
              <button
                type="button"
                className="pol-btn pol-btn--danger"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                <Trash2 size={16} /> Xóa
              </button>
              <div className="pol-menu" ref={menuRef}>
                <button
                  type="button"
                  className="pol-icon-btn"
                  aria-label="Thao tác khác"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <MoreHorizontal size={18} />
                </button>
                {menuOpen && (
                  <div className="pol-menu-list" role="menu">
                    {detail.status !== 'Active' && (
                      <button type="button" onClick={() => void changeStatus('Active')}>
                        <ShieldCheck size={15} /> Kích hoạt
                      </button>
                    )}
                    {detail.status === 'Active' && (
                      <button type="button" onClick={() => void changeStatus('Inactive')}>
                        <Ban size={15} /> Ngừng áp dụng
                      </button>
                    )}
                    {detail.status !== 'Draft' && (
                      <button type="button" onClick={() => void changeStatus('Draft')}>Đưa về nháp</button>
                    )}
                    <button
                      type="button"
                      className="pol-danger"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmDelete(true);
                      }}
                    >
                      <Trash2 size={15} /> Xóa chính sách
                    </button>
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
                    <strong>
                      {card.value}
                      {card.unit ? <span> {card.unit}</span> : null}
                    </strong>
                    <small>{card.label}</small>
                  </article>
                ))}
              </div>
            </>
          )}

          <div className="pol-tabs">
            <button type="button" className={detailTab === 'general' ? 'active' : ''} onClick={() => setDetailTab('general')}>Thông tin chung</button>
            <button type="button" className={detailTab === 'rules' ? 'active' : ''} onClick={() => setDetailTab('rules')}>Chi tiết cấu hình</button>
            <button type="button" className={detailTab === 'targets' ? 'active' : ''} onClick={() => setDetailTab('targets')}>Đối tượng áp dụng</button>
            <button type="button" className={detailTab === 'history' ? 'active' : ''} onClick={() => setDetailTab('history')}>Lịch sử thay đổi</button>
          </div>

          <div className="pol-detail-body">
            {detailTab === 'general' && (
              <dl className="pol-facts">
                <div>
                  <dt>Mã chính sách</dt>
                  <dd>{detail.code}</dd>
                </div>
                <div>
                  <dt>Loại chính sách</dt>
                  <dd>{TYPE_LABELS[detail.policyType]}</dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{STATUS_LABELS[detail.status]}</dd>
                </div>
                <div>
                  <dt>Ngày tạo</dt>
                  <dd>{formatDateTime(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt>Người tạo</dt>
                  <dd>{detail.createdByName || 'Hệ thống / Admin'}</dd>
                </div>
                <div>
                  <dt>Cập nhật lần cuối</dt>
                  <dd>{formatDateTime(detail.updatedAt)}</dd>
                </div>
              </dl>
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
                    <Users size={16} />
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
                    <History size={16} />
                    <div>
                      <strong>{h.changeSummary}</strong>
                      <small>{h.changedByName || 'Hệ thống'} · {formatDateTime(h.createdAt)}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmDelete && detail && (
        <div
          className="pol-confirm-scrim"
          role="presentation"
          onClick={() => {
            if (!deleting) setConfirmDelete(false);
          }}
        >
          <div
            className="pol-confirm"
            role="dialog"
            aria-labelledby="pol-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="pol-delete-title">Xóa chính sách?</h3>
            <p>
              Bạn sắp xóa <strong>{detail.name}</strong> ({detail.code}).
              Chính sách sẽ không còn xuất hiện trong danh sách.
            </p>
            <footer>
              <button type="button" className="pol-btn" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                Hủy
              </button>
              <button
                type="button"
                className="pol-btn pol-btn--danger-solid"
                disabled={deleting}
                onClick={() => void deletePolicy()}
              >
                {deleting ? 'Đang xóa...' : 'Xóa chính sách'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminPolicyDetailPage;
