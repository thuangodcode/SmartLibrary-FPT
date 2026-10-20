import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  DEFAULT_PARAMS,
  emptyForm,
  formFromDetail,
  policyHref,
  STATUS_LABELS,
  TYPE_LABELS,
  usePolicyClient,
  type ApiResult,
  type FormState,
  type PolicyDetail,
  type PolicyStatus,
  type PolicyType,
} from '../policies/policyShared';
import './AdminPoliciesPage.css';

interface AdminPolicyFormPageProps {
  mode: 'create' | 'edit';
}

const AdminPolicyFormPage: React.FC<AdminPolicyFormPageProps> = ({ mode }) => {
  const { policyCode } = useParams();
  const navigate = useNavigate();
  const { authHeaders, toast, showToast } = usePolicyClient();
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
      const res = await fetch(`${API_BASE_URL}/api/v1/policy-rules/${encodeURIComponent(key)}`, { headers: authHeaders });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (res.status === 404 || !json?.success || !json.data) {
        setNotFound(true);
        return;
      }
      setForm(formFromDetail(json.data));
      if (json.data.code && key.toLowerCase() !== json.data.code.toLowerCase()) {
        navigate(policyHref(json.data.code, '/edit'), { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được chính sách.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, navigate]);

  useEffect(() => {
    if (mode === 'edit' && policyCode) void loadDetail(policyCode);
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
        status,
        priority: form.priority,
        overridesGeneral: form.overridesGeneral,
        parameters: form.parameters,
        targets: form.targets,
      };
      const url = mode === 'edit' && policyCode
        ? `${API_BASE_URL}/api/v1/policy-rules/${encodeURIComponent(policyCode)}`
        : `${API_BASE_URL}/api/v1/policy-rules`;
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const json = await parseApiResponse<ApiResult<PolicyDetail>>(res);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error || 'Lưu chính sách thất bại.');
      }
      navigate(policyHref(json.data.code));
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
          <button type="button" className="pol-btn" onClick={() => navigate('/admin/policies')}>
            Quay lại danh sách
          </button>
        </div>
      ) : (
        <div className="pol-card pol-form">
          <header className="pol-form-head">
            <div>
              <h1>{mode === 'edit' ? 'Chỉnh sửa chính sách' : 'Thêm chính sách'}</h1>
              <p>
                {mode === 'edit'
                  ? `Cập nhật dữ liệu thật của ${policyCode}. Hủy sẽ quay về chi tiết mà không lưu.`
                  : 'Chỉ hiển thị trường tương ứng với danh mục đã chọn.'}
              </p>
            </div>
            <button type="button" className="pol-btn" onClick={cancel} disabled={saving}>
              <ArrowLeft size={16} /> Hủy
            </button>
          </header>

          <div className="pol-form-grid">
            <label>
              Tên chính sách
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Danh mục chính sách
              <select
                value={form.policyType}
                disabled={mode === 'edit'}
                onChange={(e) => onTypeChange(e.target.value as PolicyType)}
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            {mode === 'edit' && (
              <label>
                Trạng thái
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PolicyStatus })}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="pol-form-wide">
              Mô tả
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
          </div>

          <h2 className="pol-section-title">Quy định cụ thể · {TYPE_LABELS[form.policyType]}</h2>
          <div className="pol-form-grid">
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
          </div>

          <h2 className="pol-section-title">Đối tượng áp dụng</h2>
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

          <footer className="pol-form-actions">
            <button type="button" className="pol-btn" disabled={saving} onClick={cancel}>Hủy</button>
            {mode === 'create' ? (
              <>
                <button type="button" className="pol-btn" disabled={saving} onClick={() => void persist('Draft')}>
                  {saving ? 'Đang lưu...' : 'Lưu bản nháp'}
                </button>
                <button type="button" className="pol-btn pol-btn--primary" disabled={saving} onClick={() => void persist('Active')}>
                  {saving ? 'Đang lưu...' : 'Tạo chính sách'}
                </button>
              </>
            ) : (
              <button type="button" className="pol-btn pol-btn--primary" disabled={saving} onClick={() => void persist(form.status)}>
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            )}
          </footer>
        </div>
      )}
    </section>
  );
};

export default AdminPolicyFormPage;
