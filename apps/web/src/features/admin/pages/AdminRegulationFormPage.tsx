import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  DEFAULT_PARAMS,
  emptyForm,
  formFromDetail,
  regulationHref,
  STATUS_LABELS,
  TYPE_LABELS,
  useRegulationClient,
  type ApiResult,
  type FormState,
  type RegulationDetail,
  type RegulationStatus,
  type RegulationType,
} from '../regulations/regulationShared';
import './AdminRegulationsPage.css';

interface AdminRegulationFormPageProps {
  mode: 'create' | 'edit';
}

const AdminRegulationFormPage: React.FC<AdminRegulationFormPageProps> = ({ mode }) => {
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
    if (mode === 'edit' && regulationId) {
      const timer = window.setTimeout(() => {
        void loadDetail(regulationId);
      }, 0);
      return () => window.clearTimeout(timer);
    }
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
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        policyType: form.policyType,
        status,
        priority: form.priority,
        overridesGeneral: form.overridesGeneral,
        parameters: form.parameters.filter((p) => p.key.trim()),
        targets: form.targets,
      };
      const url = mode === 'edit' && regulationId
        ? `${API_BASE_URL}/api/v1/regulations/${encodeURIComponent(regulationId)}`
        : `${API_BASE_URL}/api/v1/regulations`;
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const json = await parseApiResponse<ApiResult<RegulationDetail>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Lưu quy định thất bại.');
      }
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
              <p>
                {mode === 'edit'
                  ? 'Chỉnh sửa nội dung tham khảo. Chỉ công bố sau khi Admin xác nhận tại FPT TP.HCM.'
                  : 'Nhập nội quy tham khảo. Bản mới được lưu ở trạng thái bản nháp, chưa công bố tại FPT TP.HCM.'}
              </p>
            </div>
            <button type="button" className="reg-btn" onClick={cancel} disabled={saving}>
              <ArrowLeft size={16} /> Hủy
            </button>
          </header>

          <div className="reg-form-grid">
            <label>
              Tên quy định
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Danh mục
              <select
                value={form.policyType}
                disabled={mode === 'edit'}
                onChange={(e) => onTypeChange(e.target.value as RegulationType)}
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            {mode === 'edit' && (
              <label>
                Trạng thái
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RegulationStatus })}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="reg-form-wide">
              Nội dung quy định
              <textarea rows={8} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mỗi ý một dòng" />
            </label>
          </div>

          <h2 className="reg-section-title">Nguồn tham khảo và xác minh campus</h2>
          <div className="reg-form-grid">
            {form.parameters.map((p, idx) => (
              <label key={p.key} className={p.key === 'campus_note' ? 'reg-form-wide' : undefined}>
                {p.label || p.key}
                {p.key === 'campus_note' ? (
                  <textarea
                    rows={3}
                    value={p.value}
                    onChange={(e) => {
                      const next = [...form.parameters];
                      next[idx] = { ...p, value: e.target.value };
                      setForm({ ...form, parameters: next });
                    }}
                  />
                ) : (
                  <input
                    value={p.value}
                    onChange={(e) => {
                      const next = [...form.parameters];
                      next[idx] = { ...p, value: e.target.value };
                      setForm({ ...form, parameters: next });
                    }}
                  />
                )}
              </label>
            ))}
          </div>

          <h2 className="reg-section-title">Đối tượng áp dụng</h2>
          {form.targets.map((t, idx) => (
            <div className="reg-target-edit" key={`${idx}-${t.targetType}`}>
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

          <footer className="reg-form-actions">
            <button type="button" className="reg-btn" disabled={saving} onClick={cancel}>Hủy</button>
            {mode === 'create' ? (
              <button type="button" className="reg-btn reg-btn--primary" disabled={saving} onClick={() => void persist('Draft')}>
                {saving ? 'Đang lưu...' : 'Lưu bản nháp'}
              </button>
            ) : (
              <button type="button" className="reg-btn reg-btn--primary" disabled={saving} onClick={() => void persist(form.status)}>
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            )}
          </footer>
        </div>
      )}
    </section>
  );
};

export default AdminRegulationFormPage;
