import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  BookCopy,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  PackagePlus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import './LibrarianCopiesPage.css';

type CopyCondition = 'New' | 'Good' | 'Fair' | 'Damaged' | 'Lost';

interface CopyItem {
  id: string;
  bookId: string;
  bookTitle: string;
  barcode: string;
  condition: CopyCondition;
  location: string | null;
  isAvailable: boolean;
  categories: string[];
  authors: string[];
  createdAt: string;
}

interface BookOption {
  id: string;
  code: string;
  title: string;
  isbn?: string | null;
  totalCopies: number;
  categoryNames: string[];
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  meta?: {
    totalCount?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
  };
}

interface CopySummary {
  totalCopies: number;
  availableCopies: number;
  unavailableCopies: number;
  locations: number;
}

interface StorageLocation {
  id: string;
  name: string;
  copyCount: number;
  capacity: number;
  availableCapacity: number;
}

const PAGE_SIZE = 20;
const CONDITIONS: CopyCondition[] = ['New', 'Good', 'Fair', 'Damaged', 'Lost'];
const conditionLabels: Record<CopyCondition, string> = {
  New: 'Mới',
  Good: 'Tốt',
  Fair: 'Trung bình',
  Damaged: 'Hư hỏng',
  Lost: 'Thất lạc',
};

interface LibrarianCopiesPageProps {
  embedded?: boolean;
}

const LibrarianCopiesPage: React.FC<LibrarianCopiesPageProps> = ({ embedded = false }) => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const { showToast } = useToast();
  const [tab, setTab] = useState<'copies' | 'locations'>('copies');
  const [copies, setCopies] = useState<CopyItem[]>([]);
  const [summary, setSummary] = useState<CopySummary | null>(null);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [editCopy, setEditCopy] = useState<CopyItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [bookOptions, setBookOptions] = useState<BookOption[]>([]);
  const [bookSearch, setBookSearch] = useState('');
  const [debouncedBookSearch, setDebouncedBookSearch] = useState('');
  const [intakeBookId, setIntakeBookId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [intakeLocation, setIntakeLocation] = useState('');
  const [intakeCondition, setIntakeCondition] = useState<CopyCondition>('New');
  const [editLocation, setEditLocation] = useState('');
  const [editCondition, setEditCondition] = useState<CopyCondition>('Good');
  const [selectedCopyIds, setSelectedCopyIds] = useState<string[]>([]);
  const [transferLocations, setTransferLocations] = useState<Record<string, string>>({});
  const [transferOpen, setTransferOpen] = useState(false);

  const headers = useMemo(() => {
    const result: Record<string, string> = {};
    if (accessToken) result.Authorization = `Bearer ${accessToken}`;
    return result;
  }, [accessToken]);

  const fetchInventory = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (selectedLocation) params.set('location', selectedLocation);
    const response = await fetch(`${API_BASE_URL}/api/v1/copies?${params}`, { headers });
    const result = await parseApiResponse<Envelope<CopyItem[]>>(response);
    if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tải danh sách bản sao.');
    setCopies(result.data ?? []);
    setPageCount(Math.max(1, result.meta?.totalPages ?? 1));
  }, [debouncedSearch, headers, page, selectedLocation]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, locationsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/copies/summary`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/copies/locations`, { headers }),
      ]);
      const [summaryResult, locationsResult] = await Promise.all([
        parseApiResponse<Envelope<CopySummary>>(summaryResponse),
        parseApiResponse<Envelope<StorageLocation[]>>(locationsResponse),
      ]);
      if (!summaryResponse.ok || !summaryResult?.success) {
        throw new Error(summaryResult?.error || 'Không thể tải thống kê kho.');
      }
      if (!locationsResponse.ok || !locationsResult?.success) {
        throw new Error(locationsResult?.error || 'Không thể tải danh sách vị trí lưu trữ.');
      }
      setSummary(summaryResult.data ?? null);
      setLocations(locationsResult.data ?? []);
      await fetchInventory();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Không thể tải dữ liệu kho.';
      setError(message);
      showToast({ type: 'error', title: 'Lỗi tải kho sách', message });
    } finally {
      setLoading(false);
    }
  }, [fetchInventory, headers, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshData(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshData]);

  useEffect(() => {
    if (!intakeOpen) return;
    let cancelled = false;
    const loadBooks = async () => {
      try {
        const params = new URLSearchParams({ page: '1', pageSize: '100' });
        if (debouncedBookSearch.trim()) params.set('search', debouncedBookSearch.trim());
        const response = await fetch(`${API_BASE_URL}/api/v1/books?${params}`, { headers });
        const result = await parseApiResponse<Envelope<BookOption[]>>(response);
        if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tải danh sách đầu sách.');
        if (!cancelled) setBookOptions(result.data ?? []);
      } catch (caught) {
        if (!cancelled) {
          const message = caught instanceof Error ? caught.message : 'Không thể tải danh sách đầu sách.';
          showToast({ type: 'error', title: 'Lỗi tải đầu sách', message });
        }
      }
    };
    void loadBooks();
    return () => { cancelled = true; };
  }, [debouncedBookSearch, headers, intakeOpen, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedBookSearch(bookSearch), 250);
    return () => window.clearTimeout(timer);
  }, [bookSearch]);

  const handleIntake = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!intakeBookId || quantity < 1 || quantity > 500) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/intake`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: intakeBookId,
          quantity,
          location: intakeLocation,
          condition: intakeCondition,
        }),
      });
      const result = await parseApiResponse<Envelope<{ addedCopies: number }>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể nhập bản sao.');
      showToast({
        type: 'success',
        title: 'Đã nhập bản sao',
        message: `Đã tạo ${result.data?.addedCopies ?? quantity} bản sao gắn với đầu sách đã chọn.`,
      });
      setIntakeOpen(false);
      setIntakeBookId('');
      setBookSearch('');
      setQuantity(1);
      setIntakeLocation('');
      await refreshData();
    } catch (caught) {
      showToast({
        type: 'error',
        title: 'Nhập bản sao thất bại',
        message: caught instanceof Error ? caught.message : 'Không thể nhập bản sao.',
      });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (copy: CopyItem) => {
    setEditCopy(copy);
    setEditLocation(copy.location ?? '');
    setEditCondition(copy.condition);
  };

  const handleUpdateCopy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editCopy) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/${editCopy.id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: editLocation, condition: editCondition }),
      });
      const result = await parseApiResponse<Envelope<CopyItem>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể cập nhật bản sao.');
      setEditCopy(null);
      await refreshData();
      showToast({ type: 'success', title: 'Đã cập nhật bản sao', message: 'Vị trí và tình trạng bản sao đã được lưu.' });
    } catch (caught) {
      showToast({
        type: 'error',
        title: 'Cập nhật thất bại',
        message: caught instanceof Error ? caught.message : 'Không thể cập nhật bản sao.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateShelf = async () => {
    const name = window.prompt('Tên kệ sách mới (ví dụ: Tầng 2 · Kệ M)')?.trim();
    if (!name) return;
    const capacityText = window.prompt('Sức chứa tối đa (mặc định 100)', '100');
    if (capacityText === null) return;
    const capacity = Number(capacityText);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
      showToast({ type: 'error', title: 'Sức chứa không hợp lệ', message: 'Nhập số nguyên từ 1 đến 10.000.' });
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/locations`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, capacity }),
      });
      const result = await parseApiResponse<Envelope<StorageLocation>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tạo kệ.');
      await refreshData();
      showToast({ type: 'success', title: 'Đã tạo kệ', message: `Kệ ${name} đã sẵn sàng.` });
    } catch (caught) {
      showToast({ type: 'error', title: 'Tạo kệ thất bại', message: caught instanceof Error ? caught.message : 'Không thể tạo kệ.' });
    }
  };

  const handleEditShelf = async (location: StorageLocation) => {
    const name = window.prompt('Tên kệ sách', location.name)?.trim();
    if (!name) return;
    const capacityText = window.prompt('Sức chứa tối đa', String(location.capacity));
    if (capacityText === null) return;
    const capacity = Number(capacityText);
    if (!Number.isInteger(capacity) || capacity < location.copyCount || capacity > 10000) {
      showToast({ type: 'error', title: 'Sức chứa không hợp lệ', message: `Sức chứa phải từ ${location.copyCount} đến 10.000 cuốn.` });
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/locations/${location.id}`, {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, capacity }),
      });
      const result = await parseApiResponse<Envelope<StorageLocation>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể cập nhật kệ.');
      await refreshData();
      showToast({ type: 'success', title: 'Đã cập nhật kệ', message: 'Tên kệ và sức chứa mới đã được áp dụng cho các bản sao đang lưu.' });
    } catch (caught) {
      showToast({ type: 'error', title: 'Cập nhật kệ thất bại', message: caught instanceof Error ? caught.message : 'Không thể cập nhật kệ.' });
    }
  };

  const handleSaveTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const assignments = selectedCopyIds.map(copyId => ({ copyId, location: transferLocations[copyId] ?? '' }));
    if (assignments.some(item => !item.location)) {
      showToast({ type: 'error', title: 'Chưa chọn kệ đích', message: 'Chọn kệ cho từng bản sao trước khi xác nhận.' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/locations/transfer`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ assignments }),
      });
      const result = await parseApiResponse<Envelope<{ movedCopies: number }>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể điều chuyển bản sao.');
      setTransferOpen(false); setSelectedCopyIds([]); setTransferLocations({});
      await refreshData();
      showToast({ type: 'success', title: 'Điều chuyển thành công', message: `Đã cập nhật ${result.data?.movedCopies ?? assignments.length} bản sao.` });
    } catch (caught) {
      showToast({ type: 'error', title: 'Điều chuyển thất bại', message: caught instanceof Error ? caught.message : 'Không thể điều chuyển bản sao.' });
    } finally { setSaving(false); }
  };

  const startLoading = (nextPage: number) => {
    setPage(nextPage);
    setLoading(true);
  };

  return (
    <section className={`lib-copies-page${embedded ? ' lib-copies-page--embedded' : ''}`}>
      <header className="lib-copies-heading">
        <div>
          {!embedded && <p className="lib-copies-eyebrow"><Archive size={15} /> KHÔNG GIAN THỦ THƯ · QUẢN LÝ KHO</p>}
          {!embedded && <h1>Bản sao & Kho sách</h1>}
          {!embedded && <span>Theo dõi từng cuốn sách bằng mã riêng, quản lý tình trạng và vị trí trên kệ.</span>}
        </div>
        <button type="button" className="lib-copies-primary" onClick={() => setIntakeOpen(true)}>
          <PackagePlus size={17} /> Nhập bản sao
        </button>
      </header>

      <section className="lib-copies-metrics" aria-label="Thống kê kho sách">
        <article><span className="lib-copies-metric-icon"><BookCopy size={19} /></span><span>Tổng bản sao</span><strong>{summary?.totalCopies ?? '—'}</strong></article>
        <article><span className="lib-copies-metric-icon is-green"><Check size={19} /></span><span>Sẵn sàng phục vụ</span><strong>{summary?.availableCopies ?? '—'}</strong></article>
        <article><span className="lib-copies-metric-icon is-blue"><Boxes size={19} /></span><span>Đang lưu tại vị trí</span><strong>{summary?.locations ?? '—'}</strong></article>
        <article><span className="lib-copies-metric-icon is-slate"><Archive size={19} /></span><span>Chưa sẵn sàng</span><strong>{summary?.unavailableCopies ?? '—'}</strong></article>
      </section>

      <div className="lib-copies-tabs" role="tablist" aria-label="Chế độ xem kho">
        <button type="button" role="tab" aria-selected={tab === 'copies'} className={tab === 'copies' ? 'is-active' : ''} onClick={() => setTab('copies')}>
          <BookCopy size={16} /> Danh sách bản sao
        </button>
        <button type="button" role="tab" aria-selected={tab === 'locations'} className={tab === 'locations' ? 'is-active' : ''} onClick={() => setTab('locations')}>
          <MapPin size={16} /> Kệ & vị trí lưu trữ
        </button>
      </div>

      <section className="lib-copies-panel">
        {tab === 'copies' ? (
          <>
            <div className="lib-copies-toolbar">
              <label className="lib-copies-search">
                <Search size={17} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên sách, mã bản sao, ISBN hoặc vị trí..." />
              </label>
              <label className="lib-copies-location-filter">
                <MapPin size={16} />
                <select value={selectedLocation} onChange={(event) => { setSelectedLocation(event.target.value); setPage(1); setLoading(true); }}>
                  <option value="">Tất cả vị trí</option>
                  {locations.map((location) => <option key={location.name} value={location.name}>{location.name}</option>)}
                </select>
              </label>
              <button type="button" className="lib-copies-refresh" onClick={() => void refreshData()} title="Làm mới"><RefreshCw size={16} className={loading ? 'is-spinning' : ''} /></button>
            </div>
            {selectedCopyIds.length > 0 && <div className="lib-copies-transfer-bar"><span>Đã chọn {selectedCopyIds.length} bản sao</span><button type="button" onClick={() => { setTransferLocations(Object.fromEntries(selectedCopyIds.map(id => [id, '']))); setTransferOpen(true); }}>Điều chuyển / hoán đổi kệ</button><button type="button" onClick={() => setSelectedCopyIds([])}>Bỏ chọn</button></div>}
            {error && <div className="lib-copies-error" role="alert">{error}<button type="button" onClick={() => void refreshData()}>Thử lại</button></div>}
            {loading ? (
              <div className="lib-copies-loading" role="status"><span /><p>Đang tải danh sách bản sao...</p></div>
            ) : copies.length === 0 ? (
              <div className="lib-copies-empty"><Archive size={30} /><strong>Chưa có bản sao phù hợp</strong><p>Thử tìm kiếm bằng từ khóa khác hoặc nhập bản sao cho một đầu sách đã có.</p></div>
            ) : (
              <div className="lib-copies-table-wrap">
                <table className="lib-copies-table">
                  <thead><tr><th><input aria-label="Chọn bản sao trang này" type="checkbox" checked={copies.length > 0 && copies.every(copy => selectedCopyIds.includes(copy.id))} onChange={event => setSelectedCopyIds(event.target.checked ? [...new Set([...selectedCopyIds, ...copies.map(copy => copy.id)])] : selectedCopyIds.filter(id => !copies.some(copy => copy.id === id)))} /></th><th>Mã bản sao</th><th>Đầu sách gốc</th><th>Danh mục</th><th>Kệ / Vị trí</th><th>Tình trạng</th><th>Khả dụng</th><th /></tr></thead>
                  <tbody>{copies.map((copy) => (
                    <tr key={copy.id}>
                      <td><input aria-label={`Chọn ${copy.barcode}`} type="checkbox" checked={selectedCopyIds.includes(copy.id)} onChange={event => setSelectedCopyIds(current => event.target.checked ? [...new Set([...current, copy.id])] : current.filter(id => id !== copy.id))} /></td>
                      <td><code>{copy.barcode}</code></td>
                      <td><Link className="lib-copy-book-link" to={`/librarian/books/${copy.bookId}`}><strong>{copy.bookTitle}</strong></Link><small>{copy.authors.join(', ') || 'Chưa rõ tác giả'}</small></td>
                      <td>{copy.categories.join(', ') || 'Chưa phân loại'}</td>
                      <td>{copy.location || <span className="lib-copies-unassigned">Chưa xếp kệ</span>}</td>
                      <td><span className={`lib-copy-condition is-${copy.condition.toLowerCase()}`}>{conditionLabels[copy.condition]}</span></td>
                      <td><span className={`lib-copy-availability ${copy.isAvailable ? 'is-available' : 'is-unavailable'}`}>{copy.isAvailable ? 'Sẵn sàng' : copy.condition === 'Lost' ? 'Thất lạc' : copy.condition === 'Damaged' ? 'Hư hỏng' : 'Đang mượn / khóa'}</span></td>
                      <td><button type="button" className="lib-copy-edit" onClick={() => openEdit(copy)}>Sửa vị trí</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <footer className="lib-copies-pagination">
              <span>Trang {page} / {pageCount}</span>
              <div>
                <button type="button" disabled={page <= 1 || loading} onClick={() => startLoading(page - 1)} aria-label="Trang trước"><ChevronLeft size={17} /></button>
                <button type="button" disabled={page >= pageCount || loading} onClick={() => startLoading(page + 1)} aria-label="Trang sau"><ChevronRight size={17} /></button>
              </div>
            </footer>
          </>
        ) : (
          <div className="lib-copies-location-grid">
            <div className="lib-copies-shelf-actions"><div><strong>Quản lý kệ sách</strong><small>Sức chứa áp dụng theo từng kệ; kệ đang có sách không thể xóa.</small></div><button type="button" onClick={() => void handleCreateShelf()}>+ Thêm kệ mới</button></div>
            {locations.length ? locations.map((location) => (
              <article className="lib-copies-shelf-card" key={location.id}>
                <button type="button" className="lib-copies-shelf-open" onClick={() => { setSelectedLocation(location.name); setTab('copies'); setPage(1); setLoading(true); }}>
                  <span><MapPin size={19} /></span><strong>{location.name}</strong><small>{location.copyCount} / {location.capacity} bản sao · còn {location.availableCapacity} chỗ</small><ChevronRight size={17} />
                  <span className="lib-copies-capacity-track"><i style={{ width: `${Math.min(100, (location.copyCount / location.capacity) * 100)}%` }} /></span>
                </button>
                <button type="button" className="lib-copies-shelf-edit" onClick={() => void handleEditShelf(location)}>Sửa kệ</button>
                <button type="button" className="lib-copies-shelf-delete" disabled={location.copyCount > 0} title={location.copyCount > 0 ? 'Chuyển sách ra khỏi kệ trước khi ngừng sử dụng' : 'Ngừng sử dụng kệ'} onClick={async () => {
                  if (!window.confirm(`Ngừng sử dụng kệ ${location.name}?`)) return;
                  const response = await fetch(`${API_BASE_URL}/api/v1/copies/locations/${location.id}`, { method: 'DELETE', headers });
                  const result = await parseApiResponse<Envelope<boolean>>(response);
                  if (!response.ok || !result?.success) { showToast({ type: 'error', title: 'Không thể ngừng sử dụng kệ', message: result?.error || 'Hãy thử lại.' }); return; }
                  await refreshData(); showToast({ type: 'success', title: 'Đã ngừng sử dụng kệ', message: location.name });
                }}>Ngừng sử dụng</button>
              </article>
            )) : <div className="lib-copies-empty"><MapPin size={30} /><strong>Chưa có vị trí lưu trữ</strong><p>Khi nhập hoặc cập nhật bản sao, hãy điền vị trí theo dạng khu – kệ – tầng, ví dụ: A1-K02-T03.</p></div>}
          </div>
        )}
      </section>

      {intakeOpen && (
        <div className="lib-copies-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIntakeOpen(false); }}>
          <form className="lib-copies-modal" onSubmit={handleIntake} role="dialog" aria-modal="true" aria-labelledby="lib-copy-intake-title">
            <header><div><span><PackagePlus size={19} /></span><div><h2 id="lib-copy-intake-title">Nhập bản sao sách</h2><p>Chọn đầu sách đã biên mục để tạo mã riêng cho từng cuốn.</p></div></div><button type="button" onClick={() => setIntakeOpen(false)} aria-label="Đóng"><X size={19} /></button></header>
            <label className="lib-copies-field">Tìm đầu sách
              <input value={bookSearch} onChange={(event) => setBookSearch(event.target.value)} placeholder="Nhập tên sách hoặc ISBN..." />
            </label>
            <label className="lib-copies-field">Đầu sách gốc
              <select required value={intakeBookId} onChange={(event) => setIntakeBookId(event.target.value)}>
                <option value="">Chọn đầu sách</option>
                {bookOptions.map((book) => <option key={book.id} value={book.id}>{book.title} · {book.code}{book.isbn ? ` · ${book.isbn}` : ''}</option>)}
              </select>
              {!bookOptions.length && <small>Đang tải danh sách đầu sách hoặc chưa có đầu sách nào.</small>}
            </label>
            <div className="lib-copies-form-row">
              <label className="lib-copies-field">Số lượng bản sao
                <input type="number" min={1} max={500} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required />
              </label>
              <label className="lib-copies-field">Tình trạng ban đầu
                <select value={intakeCondition} onChange={(event) => setIntakeCondition(event.target.value as CopyCondition)}>
                  {CONDITIONS.map((condition) => <option key={condition} value={condition}>{conditionLabels[condition]}</option>)}
                </select>
              </label>
            </div>
            <label className="lib-copies-field">Kệ / Vị trí lưu trữ
              <select value={intakeLocation} onChange={(event) => setIntakeLocation(event.target.value)}>
                <option value="">Chưa xếp kệ</option>
                {locations.filter(location => location.availableCapacity >= quantity || location.name === intakeLocation).map((location) => <option key={location.id} value={location.name}>{location.name} · {location.copyCount}/{location.capacity} cuốn · còn {location.availableCapacity}</option>)}
              </select>
              {intakeLocation && (() => { const shelf = locations.find(item => item.name === intakeLocation); return shelf ? <small className={shelf.availableCapacity < quantity ? 'lib-copies-capacity-warning' : ''}>{shelf.availableCapacity < quantity ? `Kệ không đủ chỗ: còn ${shelf.availableCapacity}, bạn đang nhập ${quantity}.` : `Kệ hiện có ${shelf.copyCount}/${shelf.capacity} cuốn; sau khi nhập còn ${shelf.availableCapacity - quantity} chỗ.`}</small> : null; })()}
              <small>Vị trí này được gắn vào từng bản sao vừa nhập.</small>
            </label>
            <aside className="lib-copies-intake-note">Mỗi cuốn sẽ có ID và mã vạch riêng nhưng vẫn liên kết về cùng đầu sách gốc và danh mục hiện có. Chức năng này không tạo đầu sách trùng.</aside>
            <footer><button type="button" onClick={() => setIntakeOpen(false)}>Hủy</button><button type="submit" disabled={saving || !intakeBookId || (!!intakeLocation && (locations.find(item => item.name === intakeLocation)?.availableCapacity ?? 0) < quantity)}><PackagePlus size={16} />{saving ? 'Đang nhập...' : 'Tạo các bản sao'}</button></footer>
          </form>
        </div>
      )}

      {editCopy && (
        <div className="lib-copies-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditCopy(null); }}>
          <form className="lib-copies-modal lib-copies-edit-modal" onSubmit={handleUpdateCopy} role="dialog" aria-modal="true" aria-labelledby="lib-copy-edit-title">
            <header><div><span><MapPin size={19} /></span><div><h2 id="lib-copy-edit-title">Cập nhật vị trí bản sao</h2><p>{editCopy.bookTitle} · {editCopy.barcode}</p></div></div><button type="button" onClick={() => setEditCopy(null)} aria-label="Đóng"><X size={19} /></button></header>
            <label className="lib-copies-field">Kệ / Vị trí lưu trữ
              <select value={editLocation} onChange={(event) => setEditLocation(event.target.value)}>
                <option value="">Chưa xếp kệ</option>
                {editLocation && !locations.some(location => location.name === editLocation) && (
                  <option value={editLocation}>{editLocation} (vị trí hiện tại)</option>
                )}
                {locations.filter(location => location.availableCapacity > 0 || location.name === editLocation).map((location) => <option key={location.id} value={location.name}>{location.name} · {location.copyCount}/{location.capacity}</option>)}
              </select>
            </label>
            <label className="lib-copies-field">Tình trạng bản sao
              <select value={editCondition} onChange={(event) => setEditCondition(event.target.value as CopyCondition)}>
                {CONDITIONS.map((condition) => <option key={condition} value={condition}>{conditionLabels[condition]}</option>)}
              </select>
              <small>Đánh dấu Hư hỏng hoặc Thất lạc sẽ chuyển bản sao sang trạng thái không khả dụng.</small>
            </label>
            <footer><button type="button" onClick={() => setEditCopy(null)}>Hủy</button><button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></footer>
          </form>
        </div>
      )}

      {transferOpen && (
        <div className="lib-copies-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setTransferOpen(false); }}>
          <form className="lib-copies-modal" onSubmit={handleSaveTransfer} role="dialog" aria-modal="true" aria-labelledby="lib-copy-transfer-title">
            <header><div><span><MapPin size={19} /></span><div><h2 id="lib-copy-transfer-title">Điều chuyển bản sao</h2><p>Chọn kệ đích cho từng cuốn. Có thể hoán đổi hai kệ trong cùng một lần xác nhận.</p></div></div><button type="button" onClick={() => setTransferOpen(false)} aria-label="Đóng"><X size={19} /></button></header>
            <div className="lib-copies-transfer-list">{selectedCopyIds.map(id => { const copy = copies.find(item => item.id === id); return copy ? <label key={id} className="lib-copies-field"><strong>{copy.barcode} · {copy.bookTitle}</strong><select required value={transferLocations[id] ?? ''} onChange={event => setTransferLocations(current => ({ ...current, [id]: event.target.value }))}><option value="">Chọn kệ đích</option>{locations.map(location => <option key={location.id} value={location.name}>{location.name} · {location.copyCount}/{location.capacity}</option>)}</select></label> : null; })}</div>
            <aside className="lib-copies-intake-note">Sức chứa được kiểm tra theo tổng vị trí sau khi chuyển toàn bộ danh sách. Nếu vượt sức chứa, hệ thống không lưu bất kỳ thay đổi nào.</aside>
            <footer><button type="button" onClick={() => setTransferOpen(false)}>Hủy</button><button type="submit" disabled={saving}>{saving ? 'Đang điều chuyển...' : 'Xác nhận điều chuyển'}</button></footer>
          </form>
        </div>
      )}
    </section>
  );
};

export default LibrarianCopiesPage;
