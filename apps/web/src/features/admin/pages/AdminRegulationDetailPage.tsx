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
  bodyLines,
  formatDateTime,
  getParam,
  regulationHref,
  STATUS_LABELS,
  TYPE_LABELS,
  useRegulationClient,
  type ApiResult,
  type RegulationDetail,
  type RegulationStatus,
} from '../regulations/regulationShared';
import './AdminRegulationsPage.css';

const AdminRegulationDetailPage: React.FC = () => {
  const { regulationId } = useParams();
  const navigate = useNavigate();
  const { authHeaders, toast, showToast } = useRegulationClient();
  const [detail, setDetail] = useState<RegulationDetail | null>(null);
  const [detailTab, setDetailTab] = useState<'content' | 'targets' | 'history'>('content');
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
      const timer = window.setTimeout(() => {
        setNotFound(true);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      void loadDetail(regulationId);
      setDetailTab('content');
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
    const label = STATUS_LABELS[status];
    if (!window.confirm(`Chuyển trạng thái sang "${label}"?`)) return;
    setMenuOpen(false);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/regulations/${encodeURIComponent(detail.code)}/status`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ status }),
      });
      const json = await parseApiResponse<ApiResult<RegulationDetail>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Đổi trạng thái thất bại.');
      }
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
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || 'Xóa quy định thất bại.');
      }
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
  const extraParams = (detail?.parameters ?? []).filter(
    (p) => !['source_url', 'source_label', 'campus_note'].includes(p.key),
  );
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
          <button type="button" className="reg-btn" onClick={() => navigate('/admin/regulations')}>
            Quay lại danh sách
          </button>
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
              {pending && (
                <p className="reg-verify-banner">Nguồn FPTU Hà Nội — chờ Admin xác nhận trước khi công bố tại FPT TP.HCM.</p>
              )}
            </div>
            <div className="reg-detail-actions">
              <button type="button" className="reg-btn" onClick={() => navigate('/admin/regulations')}>
                <ArrowLeft size={16} /> Quay lại
              </button>
              <button type="button" className="reg-btn reg-btn--outline" onClick={() => navigate(regulationHref(detail.code, '/edit'))}>
                <Pencil size={16} /> Chỉnh sửa
              </button>
              <div className="reg-menu" ref={menuRef}>
                <button type="button" className="reg-icon-btn" aria-label="Thao tác khác" onClick={() => setMenuOpen((open) => !open)}>
                  <MoreHorizontal size={18} />
                </button>
                {menuOpen && (
                  <div className="reg-menu-list" role="menu">
                    {detail.status !== 'PendingReview' && detail.status !== 'Active' && (
                      <button type="button" onClick={() => void changeStatus('PendingReview')}>Gửi chờ xác nhận</button>
                    )}
                    {detail.status !== 'Active' && (
                      <button type="button" onClick={() => void changeStatus('Active')}>
                        <ShieldCheck size={15} /> Duyệt và công bố
                      </button>
                    )}
                    {detail.status === 'Active' && (
                      <button type="button" onClick={() => void changeStatus('Inactive')}>
                        <Ban size={15} /> Ngừng áp dụng
                      </button>
                    )}
                    {detail.status !== 'Draft' && (
                      <button type="button" onClick={() => void changeStatus('Draft')}>Đưa về bản nháp</button>
                    )}
                    <button
                      type="button"
                      className="reg-danger"
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmDelete(true);
                      }}
                    >
                      <Trash2 size={15} /> Xóa quy định
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="reg-tabs">
            <button type="button" className={detailTab === 'content' ? 'active' : ''} onClick={() => setDetailTab('content')}>Nội dung</button>
            <button type="button" className={detailTab === 'targets' ? 'active' : ''} onClick={() => setDetailTab('targets')}>Đối tượng</button>
            <button type="button" className={detailTab === 'history' ? 'active' : ''} onClick={() => setDetailTab('history')}>Lịch sử</button>
          </div>

          {detailTab === 'content' && (
            <div className="reg-content">
              <ul className="reg-body">
                {bodyLines(detail.description).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {extraParams.length > 0 && (
                <div className="reg-ref-values">
                  {extraParams.map((p) => (
                    <div key={p.key} className="reg-rule-row">
                      <span>{p.label || p.key}</span>
                      <strong>{p.value || '—'}</strong>
                    </div>
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

          {detailTab === 'targets' && (
            <div>
              {detail.targets.length === 0 ? (
                <p className="reg-muted">Chưa gán đối tượng áp dụng.</p>
              ) : detail.targets.map((t, idx) => (
                <div key={`${t.targetType}-${t.targetValue}-${idx}`} className="reg-target-row">
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
            <div>
              {detail.histories.length === 0 ? (
                <p className="reg-muted">Chưa có lịch sử thay đổi.</p>
              ) : detail.histories.map((h) => (
                <div key={h.id} className="reg-history-row">
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
      )}

      {confirmDelete && detail && (
        <div className="reg-confirm-scrim" role="presentation" onClick={() => { if (!deleting) setConfirmDelete(false); }}>
          <div className="reg-confirm" role="dialog" aria-labelledby="reg-delete-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="reg-delete-title">Xóa quy định?</h3>
            <p>Bạn sắp xóa <strong>{detail.name}</strong> ({detail.code}).</p>
            <footer>
              <button type="button" className="reg-btn" disabled={deleting} onClick={() => setConfirmDelete(false)}>Hủy</button>
              <button type="button" className="reg-btn reg-btn--danger-solid" disabled={deleting} onClick={() => void deleteRegulation()}>
                {deleting ? 'Đang xóa...' : 'Xóa quy định'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminRegulationDetailPage;
