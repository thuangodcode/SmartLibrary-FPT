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
  warehouseCopies: number;
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

interface ShelfRestockAlert {
  id: string;
  title: string;
  onShelf: number;
  inWarehouse: number;
}

interface SortingBookOption {
  id: string;
  title: string;
  code: string;
  onShelfCopies: number;
  inWarehouseCopies: number;
}

interface BookCopyGroup {
  id: string;
  title: string;
  code: string;
  totalCopies: number;
  onShelfCopies: number;
  inWarehouseCopies: number;
  unavailableCopies: number;
}

interface SortingCopy {
  id: string;
  barcode: string;
  condition: CopyCondition;
  hasBeenReturned: boolean;
}

interface SortingBookDetails extends SortingBookOption {
  returnedInWarehouseCopies: number;
  copies: SortingCopy[];
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
  const [tab, setTab] = useState<'copies' | 'sorting' | 'locations'>('copies');
  const [copies, setCopies] = useState<CopyItem[]>([]);
  const [bookGroups, setBookGroups] = useState<BookCopyGroup[]>([]);
  const [copyBookSearch, setCopyBookSearch] = useState('');
  const [selectedCopyBook, setSelectedCopyBook] = useState<BookCopyGroup | null>(null);
  const [bookGroupsLoading, setBookGroupsLoading] = useState(false);
  const [summary, setSummary] = useState<CopySummary | null>(null);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [restockAlerts, setRestockAlerts] = useState<ShelfRestockAlert[]>([]);
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
  const [shelfQuantity, setShelfQuantity] = useState(0);
  const [intakeLocation, setIntakeLocation] = useState('');
  const [intakeCondition, setIntakeCondition] = useState<CopyCondition>('New');
  const [editLocation, setEditLocation] = useState('');
  const [editCondition, setEditCondition] = useState<CopyCondition>('Good');
  const [selectedCopyIds, setSelectedCopyIds] = useState<string[]>([]);
  const [transferLocations, setTransferLocations] = useState<Record<string, string>>({});
  const [transferOpen, setTransferOpen] = useState(false);
  const [sortingSearch, setSortingSearch] = useState('');
  const [sortingBooks, setSortingBooks] = useState<SortingBookOption[]>([]);
  const [sortingBookId, setSortingBookId] = useState('');
  const [sortingDetails, setSortingDetails] = useState<SortingBookDetails | null>(null);
  const [sortingSelected, setSortingSelected] = useState<string[]>([]);
  const [sortingDestinations, setSortingDestinations] = useState<Record<string, string>>({});
  const [sortingLoading, setSortingLoading] = useState(false);
  const [shelfSearch, setShelfSearch] = useState('');
  const [shelfFloor, setShelfFloor] = useState('all');

  const headers = useMemo(() => {
    const result: Record<string, string> = {};
    if (accessToken) result.Authorization = `Bearer ${accessToken}`;
    return result;
  }, [accessToken]);

  const shelfFloors = useMemo(() => {
    const floors = locations.map(location => location.name.match(/^Tầng\s+(.+?)\s+·/i)?.[1]).filter((floor): floor is string => Boolean(floor));
    return Array.from(new Set(floors)).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [locations]);
  const visibleShelves = useMemo(() => locations.filter(location => {
    const floor = location.name.match(/^Tầng\s+(.+?)\s+·/i)?.[1] ?? '';
    return (shelfFloor === 'all' || floor === shelfFloor) && location.name.toLocaleLowerCase('vi').includes(shelfSearch.trim().toLocaleLowerCase('vi'));
  }), [locations, shelfFloor, shelfSearch]);

  const fetchInventory = useCallback(async (bookId?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (!bookId && debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (!bookId && selectedLocation) params.set('location', selectedLocation);
    if (bookId) params.set('bookId', bookId);
    const response = await fetch(`${API_BASE_URL}/api/v1/copies?${params}`, { headers });
    const result = await parseApiResponse<Envelope<CopyItem[]>>(response);
    if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tải danh sách bản sao.');
    setCopies(result.data ?? []);
    setPageCount(Math.max(1, result.meta?.totalPages ?? 1));
  }, [debouncedSearch, headers, page, selectedLocation]);

  const fetchBookGroups = useCallback(async () => {
    setBookGroupsLoading(true);
    try {
      const params = new URLSearchParams();
      if (copyBookSearch.trim()) params.set('search', copyBookSearch.trim());
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/book-groups?${params}`, { headers });
      const result = await parseApiResponse<Envelope<BookCopyGroup[]>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tải danh sách đầu sách.');
      setBookGroups(result.data ?? []);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Không thể tải danh sách đầu sách.';
      setError(message);
      showToast({ type: 'error', title: 'Lỗi tải đầu sách', message });
    } finally { setBookGroupsLoading(false); }
  }, [copyBookSearch, headers, showToast]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, locationsResponse, restockResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/copies/summary`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/copies/locations`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/copies/restock-alerts`, { headers }),
      ]);
      const [summaryResult, locationsResult, restockResult] = await Promise.all([
        parseApiResponse<Envelope<CopySummary>>(summaryResponse),
        parseApiResponse<Envelope<StorageLocation[]>>(locationsResponse),
        parseApiResponse<Envelope<ShelfRestockAlert[]>>(restockResponse),
      ]);
      if (!summaryResponse.ok || !summaryResult?.success) {
        throw new Error(summaryResult?.error || 'Không thể tải thống kê kho.');
      }
      if (!locationsResponse.ok || !locationsResult?.success) {
        throw new Error(locationsResult?.error || 'Không thể tải danh sách vị trí lưu trữ.');
      }
      if (!restockResponse.ok || !restockResult?.success) {
        throw new Error(restockResult?.error || 'Không thể tải cảnh báo bổ sung sách.');
      }
      setSummary(summaryResult.data ?? null);
      setLocations(locationsResult.data ?? []);
      setRestockAlerts(restockResult.data ?? []);
      await fetchInventory(selectedCopyBook?.id);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Không thể tải dữ liệu kho.';
      setError(message);
      showToast({ type: 'error', title: 'Lỗi tải kho sách', message });
    } finally {
      setLoading(false);
    }
  }, [fetchInventory, headers, selectedCopyBook?.id, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (tab === 'copies' && !selectedCopyBook) void fetchBookGroups();
  }, [fetchBookGroups, selectedCopyBook, tab]);

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

  useEffect(() => {
    if (tab !== 'sorting') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (sortingSearch.trim()) params.set('search', sortingSearch.trim());
        const response = await fetch(`${API_BASE_URL}/api/v1/copies/sorting/books?${params}`, { headers });
        const result = await parseApiResponse<Envelope<SortingBookOption[]>>(response);
        if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tải danh sách sách trong kho.');
        if (!cancelled) setSortingBooks(result.data ?? []);
      } catch (caught) {
        if (!cancelled) showToast({ type: 'error', title: 'Không thể tải danh sách xếp sách', message: caught instanceof Error ? caught.message : 'Vui lòng thử lại.' });
      }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [headers, showToast, sortingSearch, tab]);

  useEffect(() => {
    if (tab !== 'sorting' || !sortingBookId) { setSortingDetails(null); return; }
    let cancelled = false;
    setSortingLoading(true);
    void fetch(`${API_BASE_URL}/api/v1/copies/sorting/books/${sortingBookId}`, { headers })
      .then(async response => {
        const result = await parseApiResponse<Envelope<SortingBookDetails>>(response);
        if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tải bản sao trong kho.');
        if (!cancelled) { setSortingDetails(result.data ?? null); setSortingSelected([]); setSortingDestinations({}); }
      })
      .catch(caught => { if (!cancelled) showToast({ type: 'error', title: 'Không thể tải đầu sách', message: caught instanceof Error ? caught.message : 'Vui lòng thử lại.' }); })
      .finally(() => { if (!cancelled) setSortingLoading(false); });
    return () => { cancelled = true; };
  }, [headers, showToast, sortingBookId, tab]);

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
          shelfQuantity,
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
      setShelfQuantity(0);
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

  const handleEditShelf = async (location: StorageLocation) => {
    const name = window.prompt('Tên kệ (dạng: Tầng X · Kệ Y)', location.name)?.trim();
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
      showToast({ type: 'success', title: 'Đã cập nhật kệ', message: `${name}: tối đa ${capacity} bản sao.` });
    } catch (caught) {
      showToast({ type: 'error', title: 'Cập nhật kệ thất bại', message: caught instanceof Error ? caught.message : 'Không thể cập nhật kệ.' });
    }
  };

  const handleCreateShelf = async () => {
    const name = window.prompt('Tên kệ mới (dạng: Tầng X · Kệ Y, ví dụ Tầng 4 · Kệ A)')?.trim();
    if (!name) return;
    const capacityText = window.prompt('Sức chứa tối đa của kệ', '100');
    if (capacityText === null) return;
    const capacity = Number(capacityText);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
      showToast({ type: 'error', title: 'Sức chứa không hợp lệ', message: 'Sức chứa phải từ 1 đến 10.000 cuốn.' });
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/locations`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, capacity }),
      });
      const result = await parseApiResponse<Envelope<StorageLocation>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tạo kệ mới.');
      await refreshData();
      showToast({ type: 'success', title: 'Đã thêm kệ', message: `${name} đã sẵn sàng để sắp xếp sách.` });
    } catch (caught) {
      showToast({ type: 'error', title: 'Thêm kệ thất bại', message: caught instanceof Error ? caught.message : 'Không thể tạo kệ mới.' });
    }
  };

  const handleDeleteShelf = async (location: StorageLocation) => {
    if (location.copyCount > 0) return;
    if (!window.confirm(`Xóa kệ ${location.name}? Kệ chỉ xóa được khi đang trống.`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/locations/${location.id}`, { method: 'DELETE', headers });
      const result = await parseApiResponse<Envelope<boolean>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể xóa kệ.');
      await refreshData();
      showToast({ type: 'success', title: 'Đã xóa kệ', message: `${location.name} đã được gỡ khỏi danh sách.` });
    } catch (caught) {
      showToast({ type: 'error', title: 'Xóa kệ thất bại', message: caught instanceof Error ? caught.message : 'Không thể xóa kệ.' });
    }
  };

  const handleSaveSorting = async () => {
    if (!sortingSelected.length) return;
    const assignments = sortingSelected.map(copyId => ({ copyId, location: sortingDestinations[copyId] ?? '' }));
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/locations/transfer`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ assignments }),
      });
      const result = await parseApiResponse<Envelope<{ movedCopies: number }>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể lưu sắp xếp sách.');
      setSortingSelected([]);
      setSortingDestinations({});
      await refreshData();
      const detailResponse = await fetch(`${API_BASE_URL}/api/v1/copies/sorting/books/${sortingBookId}`, { headers });
      const detailResult = await parseApiResponse<Envelope<SortingBookDetails>>(detailResponse);
      if (detailResponse.ok && detailResult?.success) setSortingDetails(detailResult.data ?? null);
      showToast({ type: 'success', title: 'Đã cập nhật vị trí sách', message: `Đã xử lý ${result.data?.movedCopies ?? assignments.length} bản sao.` });
    } catch (caught) {
      showToast({ type: 'error', title: 'Không thể sắp xếp sách', message: caught instanceof Error ? caught.message : 'Vui lòng kiểm tra sức chứa kệ.' });
    } finally { setSaving(false); }
  };

  const handleSaveTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const assignments = selectedCopyIds.map(copyId => ({ copyId, location: transferLocations[copyId] ?? '' }));
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
        <article><span className="lib-copies-metric-icon is-green"><Check size={19} /></span><span>Sẵn sàng trên kệ</span><strong>{summary?.availableCopies ?? '—'}</strong></article>
        <article><span className="lib-copies-metric-icon is-blue"><Boxes size={19} /></span><span>Đang ở trong kho</span><strong>{summary?.warehouseCopies ?? '—'}</strong></article>
        <article><span className="lib-copies-metric-icon is-slate"><Archive size={19} /></span><span>Chưa sẵn sàng</span><strong>{summary?.unavailableCopies ?? '—'}</strong></article>
      </section>

      <div className="lib-copies-tabs" role="tablist" aria-label="Chế độ xem kho">
        <button type="button" role="tab" aria-selected={tab === 'copies'} className={tab === 'copies' ? 'is-active' : ''} onClick={() => setTab('copies')}>
          <BookCopy size={16} /> Danh sách bản sao
        </button>
        <button type="button" role="tab" aria-selected={tab === 'sorting'} className={tab === 'sorting' ? 'is-active' : ''} onClick={() => setTab('sorting')}>
          <Boxes size={16} /> Sắp xếp sách
        </button>
        <button type="button" role="tab" aria-selected={tab === 'locations'} className={tab === 'locations' ? 'is-active' : ''} onClick={() => setTab('locations')}>
          <MapPin size={16} /> Kệ & vị trí lưu trữ
        </button>
      </div>

      <section className="lib-copies-panel">
        {tab === 'copies' ? (
          <>
            <div className="lib-copies-toolbar">
              {selectedCopyBook && <button type="button" className="lib-copies-back-books" onClick={() => { setSelectedCopyBook(null); setCopies([]); setSelectedCopyIds([]); setSearch(''); setDebouncedSearch(''); setSelectedLocation(''); }}>‹ Tất cả đầu sách</button>}
              <label className="lib-copies-search">
                <Search size={17} />
                <input value={selectedCopyBook ? search : copyBookSearch} onChange={(event) => selectedCopyBook ? setSearch(event.target.value) : setCopyBookSearch(event.target.value)} placeholder={selectedCopyBook ? 'Tìm mã bản sao hoặc vị trí...' : 'Tìm đầu sách theo tên hoặc mã...'} />
              </label>
              {selectedCopyBook && <label className="lib-copies-location-filter">
                <MapPin size={16} />
                <select value={selectedLocation} onChange={(event) => { setSelectedLocation(event.target.value); setPage(1); setLoading(true); }}>
                  <option value="">Tất cả vị trí</option>
                  <option value="__warehouse__">Trong kho, chờ xếp kệ</option>
                  {locations.map((location) => <option key={location.name} value={location.name}>{location.name}</option>)}
                </select>
              </label>}
              <button type="button" className="lib-copies-refresh" onClick={() => void refreshData()} title="Làm mới"><RefreshCw size={16} className={loading ? 'is-spinning' : ''} /></button>
            </div>
            {selectedCopyBook && <div className="lib-copies-selected-book"><div><span>ĐẦU SÁCH ĐANG XEM</span><strong>{selectedCopyBook.title}</strong><small>{selectedCopyBook.code} · {selectedCopyBook.totalCopies} bản sao · {selectedCopyBook.onShelfCopies} trên kệ · {selectedCopyBook.inWarehouseCopies} trong kho</small></div></div>}
            {selectedCopyBook && !loading && copies.length > 0 && <div className="lib-copies-select-page"><label><input type="checkbox" checked={copies.every(copy => selectedCopyIds.includes(copy.id))} onChange={event => setSelectedCopyIds(event.target.checked ? [...new Set([...selectedCopyIds, ...copies.map(copy => copy.id)])] : selectedCopyIds.filter(id => !copies.some(copy => copy.id === id)))} /><span><strong>Chọn tất cả bản sao đang hiển thị</strong><small>Chỉ chọn các bản sao trên trang này</small></span></label><span>{copies.length} bản sao trên trang</span></div>}
            {selectedCopyBook && selectedCopyIds.length > 0 && <div className="lib-copies-selection-bar"><div className="lib-copies-selection-count"><span className="lib-copies-selection-check"><Check size={16} /></span><span><strong>{selectedCopyIds.length} bản sao được chọn</strong><small>Thao tác áp dụng cho các bản sao đã chọn trong đầu sách này.</small></span></div><div><button type="button" onClick={() => { setTransferLocations(Object.fromEntries(selectedCopyIds.map(id => [id, '']))); setTransferOpen(true); }}>Điều chuyển vị trí</button><button type="button" className="is-quiet" onClick={() => setSelectedCopyIds([])}>Bỏ chọn</button></div></div>}
            {error && <div className="lib-copies-error" role="alert">{error}<button type="button" onClick={() => void refreshData()}>Thử lại</button></div>}
            {!selectedCopyBook ? (bookGroupsLoading ? (
              <div className="lib-copies-loading" role="status"><span /><p>Đang tải danh sách đầu sách...</p></div>
            ) : bookGroups.length ? <div className="lib-copies-book-groups">{bookGroups.map(book => <button type="button" className="lib-copies-book-group" key={book.id} onClick={() => { setSelectedCopyBook(book); setPage(1); setLoading(true); setSelectedLocation(''); setSearch(''); setDebouncedSearch(''); }}>
              <span className="lib-copies-book-group-icon"><BookCopy size={20} /></span><span className="lib-copies-book-group-main"><strong>{book.title}</strong><small>Mã đầu sách: {book.code}</small></span><span className="lib-copies-book-group-count"><strong>{book.totalCopies}</strong><small>bản sao</small></span><span className="lib-copies-book-group-breakdown"><span>{book.onShelfCopies} trên kệ</span><span>{book.inWarehouseCopies} trong kho</span><span>{book.unavailableCopies} chưa sẵn sàng</span></span><ChevronRight size={18} />
            </button>)}</div> : <div className="lib-copies-empty"><BookCopy size={30} /><strong>Không tìm thấy đầu sách</strong><p>Hãy thử từ khóa khác.</p></div>) : loading ? (
              <div className="lib-copies-loading" role="status"><span /><p>Đang tải danh sách bản sao...</p></div>
            ) : copies.length === 0 ? (
              <div className="lib-copies-empty"><Archive size={30} /><strong>Chưa có bản sao phù hợp</strong><p>Thử tìm kiếm bằng từ khóa khác hoặc nhập bản sao cho một đầu sách đã có.</p></div>
            ) : (
              <div className="lib-copies-table-wrap">
                <table className="lib-copies-table">
                  <thead><tr><th></th><th>Mã bản sao</th><th>Đầu sách gốc</th><th>Danh mục</th><th>Kệ / Vị trí</th><th>Tình trạng</th><th>Khả dụng</th><th /></tr></thead>
                  <tbody>{copies.map((copy) => (
                    <tr key={copy.id}>
                      <td><input aria-label={`Chọn ${copy.barcode}`} type="checkbox" checked={selectedCopyIds.includes(copy.id)} onChange={event => setSelectedCopyIds(current => event.target.checked ? [...new Set([...current, copy.id])] : current.filter(id => id !== copy.id))} /></td>
                      <td><code>{copy.barcode}</code></td>
                      <td><Link className="lib-copy-book-link" to={`/librarian/books/${copy.bookId}`}><strong>{copy.bookTitle}</strong></Link><small>{copy.authors.join(', ') || 'Chưa rõ tác giả'}</small></td>
                      <td>{copy.categories.join(', ') || 'Chưa phân loại'}</td>
                      <td>{copy.location || <span className="lib-copies-unassigned">{copy.isAvailable ? 'Trong kho' : 'Ngoài kệ / không khả dụng'}</span>}</td>
                      <td><span className={`lib-copy-condition is-${copy.condition.toLowerCase()}`}>{conditionLabels[copy.condition]}</span></td>
                      <td><span className={`lib-copy-availability ${copy.isAvailable ? 'is-available' : 'is-unavailable'}`}>{copy.isAvailable ? 'Sẵn sàng' : copy.condition === 'Lost' ? 'Thất lạc' : copy.condition === 'Damaged' ? 'Hư hỏng' : 'Đang mượn / khóa'}</span></td>
                      <td><button type="button" className="lib-copy-edit" onClick={() => openEdit(copy)}>Sửa vị trí</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {selectedCopyBook && <footer className="lib-copies-pagination">
              <span>Trang {page} / {pageCount}</span>
              <div>
                <button type="button" disabled={page <= 1 || loading} onClick={() => startLoading(page - 1)} aria-label="Trang trước"><ChevronLeft size={17} /></button>
                <button type="button" disabled={page >= pageCount || loading} onClick={() => startLoading(page + 1)} aria-label="Trang sau"><ChevronRight size={17} /></button>
              </div>
            </footer>}
          </>
        ) : tab === 'sorting' ? (
          <div className="lib-copies-sorting">
            <header className="lib-copies-sorting-heading">
              <div><strong>Sắp xếp bản sao trong kho</strong><p>Sách trả về được đưa vào kho trước. Chọn một đầu sách để xem số bản trên kệ và các bản đang chờ sắp xếp.</p></div>
              <label className="lib-copies-search"><Search size={17} /><input value={sortingSearch} onChange={event => setSortingSearch(event.target.value)} placeholder="Lọc theo tên hoặc mã đầu sách..." /></label>
            </header>
            <label className="lib-copies-field lib-copies-sorting-book">Đầu sách
              <select value={sortingBookId} onChange={event => setSortingBookId(event.target.value)}>
                <option value="">Chọn đầu sách có bản trong kho</option>
                {sortingBooks.map(book => <option key={book.id} value={book.id}>{book.title} · {book.code} · {book.inWarehouseCopies} bản trong kho</option>)}
              </select>
            </label>
            {!sortingBookId ? <div className="lib-copies-empty"><Boxes size={30} /><strong>Chọn đầu sách để bắt đầu</strong><p>Danh sách chỉ gồm đầu sách đang có bản sao khả dụng trong kho.</p></div> : sortingLoading ? (
              <div className="lib-copies-loading" role="status"><span /><p>Đang tải bản sao...</p></div>
            ) : sortingDetails ? <>
              <div className="lib-copies-sorting-stats"><article><span>Đã xếp trên kệ</span><strong>{sortingDetails.onShelfCopies}</strong></article><article><span>Đang trong kho, chờ xếp</span><strong>{sortingDetails.inWarehouseCopies}</strong></article><article><span>Bản trả về đang chờ xếp</span><strong>{sortingDetails.returnedInWarehouseCopies}</strong></article></div>
              <div className="lib-copies-sorting-toolbar"><span>Chọn từng bản sao rồi chỉ định kệ hoặc giữ trong kho.</span><button type="button" disabled={!sortingSelected.length || saving} onClick={() => void handleSaveSorting()}>{saving ? 'Đang lưu...' : `Lưu sắp xếp (${sortingSelected.length})`}</button></div>
              <div className="lib-copies-sorting-list">
                {sortingDetails.copies.map(copy => <article key={copy.id}>
                  <label><input type="checkbox" checked={sortingSelected.includes(copy.id)} onChange={event => setSortingSelected(current => event.target.checked ? [...new Set([...current, copy.id])] : current.filter(id => id !== copy.id))} /><span><strong>{copy.barcode}</strong><small>{conditionLabels[copy.condition]} · {copy.hasBeenReturned ? 'Đã trả về' : 'Chưa có lượt mượn'}</small></span></label>
                  <select aria-label={`Vị trí của bản sao ${copy.barcode}`} value={sortingDestinations[copy.id] ?? ''} onChange={event => setSortingDestinations(current => ({ ...current, [copy.id]: event.target.value }))}>
                    <option value="">Giữ trong kho</option>
                    {locations.filter(location => location.availableCapacity > 0).map(location => <option key={location.id} value={location.name}>{location.name} · còn {location.availableCapacity} chỗ</option>)}
                  </select>
                </article>)}
                {!sortingDetails.copies.length && <div className="lib-copies-empty"><Check size={30} /><strong>Không còn bản sao trong kho cần sắp xếp</strong></div>}
              </div>
            </> : null}
          </div>
        ) : (
          <div className="lib-copies-location-grid">
            <div className="lib-copies-shelf-actions"><div><strong>Quản lý kệ sách</strong><small>Thêm, đổi tên, điều chỉnh sức chứa hoặc xóa kệ trống. Bản sao trong kho không chiếm chỗ trên kệ.</small></div><button type="button" onClick={() => void handleCreateShelf()}>+ Thêm kệ</button></div>
            <div className="lib-copies-shelf-filters">
              <label className="lib-copies-search"><Search size={17} /><input value={shelfSearch} onChange={event => setShelfSearch(event.target.value)} placeholder="Tìm nhanh theo tầng hoặc tên kệ..." /></label>
              <div className="lib-copies-floor-tabs" role="tablist" aria-label="Lọc kệ theo tầng">
                <button type="button" className={shelfFloor === 'all' ? 'is-active' : ''} onClick={() => setShelfFloor('all')}>Tất cả tầng <span>{locations.length}</span></button>
                {shelfFloors.map(floor => <button type="button" key={floor} className={shelfFloor === floor ? 'is-active' : ''} onClick={() => setShelfFloor(floor)}>Tầng {floor} <span>{locations.filter(location => location.name.match(/^Tầng\s+(.+?)\s+·/i)?.[1] === floor).length}</span></button>)}
              </div>
            </div>
            {restockAlerts.length > 0 && <section className="lib-copies-restock-alerts" aria-label="Sách cần bổ sung lên kệ"><strong>Cần xếp sách từ kho lên kệ</strong><p>Các đầu sách này đã hết bản sẵn sàng trên kệ nhưng vẫn còn bản trong kho.</p>{restockAlerts.map((alert) => <div key={alert.id}><span><b>{alert.title}</b><small>Còn {alert.inWarehouse} bản trong kho</small></span><button type="button" onClick={() => { setSearch(alert.title); setDebouncedSearch(alert.title); setSelectedLocation('__warehouse__'); setPage(1); setTab('copies'); }}>Xem bản sao</button></div>)}</section>}
            {visibleShelves.length ? visibleShelves.map((location) => (
              <article className="lib-copies-shelf-card" key={location.id}>
                <button type="button" className="lib-copies-shelf-open" onClick={() => { setSelectedLocation(location.name); setTab('copies'); setPage(1); setLoading(true); }}>
                  <span><MapPin size={19} /></span><strong>{location.name}</strong><small>{location.copyCount} / {location.capacity} bản sao · còn {location.availableCapacity} chỗ</small><ChevronRight size={17} />
                  <span className="lib-copies-capacity-track"><i style={{ width: `${Math.min(100, (location.copyCount / location.capacity) * 100)}%` }} /></span>
                </button>
                <button type="button" className="lib-copies-shelf-edit" onClick={() => void handleEditShelf(location)}>Sửa kệ</button>
                <button type="button" className="lib-copies-shelf-delete" disabled={location.copyCount > 0} title={location.copyCount > 0 ? 'Chuyển bản sao khỏi kệ trước khi xóa' : 'Xóa kệ trống'} onClick={() => void handleDeleteShelf(location)}>Xóa kệ</button>
              </article>
            )) : <div className="lib-copies-empty"><MapPin size={30} /><strong>{locations.length ? 'Không tìm thấy kệ phù hợp' : 'Chưa có vị trí lưu trữ'}</strong><p>{locations.length ? 'Thử đổi từ khóa tìm kiếm hoặc chọn tầng khác.' : 'Thêm kệ theo dạng Tầng X · Kệ Y, ví dụ Tầng 4 · Kệ A.'}</p></div>}
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
                <input type="number" min={1} max={500} value={quantity} onChange={(event) => { const next = Number(event.target.value); setQuantity(next); setShelfQuantity((current) => Math.min(current, next)); }} required />
              </label>
              <label className="lib-copies-field">Tình trạng ban đầu
                <select value={intakeCondition} onChange={(event) => { const next = event.target.value as CopyCondition; setIntakeCondition(next); if (next === 'Damaged' || next === 'Lost') setShelfQuantity(0); }}>
                  {CONDITIONS.map((condition) => <option key={condition} value={condition}>{conditionLabels[condition]}</option>)}
                </select>
              </label>
            </div>
            <label className="lib-copies-field">Kệ / Vị trí lưu trữ
              <select value={intakeLocation} onChange={(event) => { setIntakeLocation(event.target.value); if (!event.target.value) setShelfQuantity(0); else setShelfQuantity(Math.min(quantity, locations.find((location) => location.name === event.target.value)?.availableCapacity ?? 0)); }}>
                <option value="">Để toàn bộ trong kho</option>
                {locations.filter(location => location.availableCapacity > 0 || location.name === intakeLocation).map((location) => <option key={location.id} value={location.name}>{location.name} · {location.copyCount}/{location.capacity} chỗ · còn {location.availableCapacity}</option>)}
              </select>
              {intakeLocation && <label className="lib-copies-field">Số bản đưa lên kệ (còn lại vào kho)
                <input type="number" min={0} max={quantity} value={shelfQuantity} onChange={(event) => setShelfQuantity(Number(event.target.value))} />
                <small>Kệ còn {locations.find(item => item.name === intakeLocation)?.availableCapacity ?? 0} chỗ; đang chọn {shelfQuantity} bản lên kệ và {Math.max(0, quantity - shelfQuantity)} bản vào kho.</small>
              </label>}
              <small>Bản sao trong kho chưa thể cho mượn; thủ thư cần chuyển lên kệ để độc giả có thể mượn.</small>
            </label>
            <aside className="lib-copies-intake-note">Mỗi cuốn sẽ có ID và mã vạch riêng nhưng vẫn liên kết về cùng đầu sách gốc và danh mục hiện có. Chức năng này không tạo đầu sách trùng.</aside>
            <footer><button type="button" onClick={() => setIntakeOpen(false)}>Hủy</button><button type="submit" disabled={saving || !intakeBookId || shelfQuantity > quantity || (shelfQuantity > 0 && (intakeCondition === 'Damaged' || intakeCondition === 'Lost')) || shelfQuantity > (locations.find(item => item.name === intakeLocation)?.availableCapacity ?? 0)}><PackagePlus size={16} />{saving ? 'Đang nhập...' : 'Tạo các bản sao'}</button></footer>
          </form>
        </div>
      )}

      {editCopy && (
        <div className="lib-copies-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditCopy(null); }}>
          <form className="lib-copies-modal lib-copies-edit-modal" onSubmit={handleUpdateCopy} role="dialog" aria-modal="true" aria-labelledby="lib-copy-edit-title">
            <header><div><span><MapPin size={19} /></span><div><h2 id="lib-copy-edit-title">Cập nhật vị trí bản sao</h2><p>{editCopy.bookTitle} · {editCopy.barcode}</p></div></div><button type="button" onClick={() => setEditCopy(null)} aria-label="Đóng"><X size={19} /></button></header>
            <label className="lib-copies-field">Kệ / Vị trí lưu trữ
              <select value={editLocation} onChange={(event) => setEditLocation(event.target.value)}>
                <option value="">Trong kho</option>
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
            <div className="lib-copies-transfer-list">{selectedCopyIds.map(id => { const copy = copies.find(item => item.id === id); return copy ? <label key={id} className="lib-copies-field"><strong>{copy.barcode} · {copy.bookTitle}</strong><select value={transferLocations[id] ?? ''} onChange={event => setTransferLocations(current => ({ ...current, [id]: event.target.value }))}><option value="">Đưa vào kho</option>{locations.map(location => <option key={location.id} value={location.name}>{location.name} · {location.copyCount}/{location.capacity}</option>)}</select></label> : null; })}</div>
            <aside className="lib-copies-intake-note">Sức chứa được kiểm tra theo tổng vị trí sau khi chuyển toàn bộ danh sách. Nếu vượt sức chứa, hệ thống không lưu bất kỳ thay đổi nào.</aside>
            <footer><button type="button" onClick={() => setTransferOpen(false)}>Hủy</button><button type="submit" disabled={saving}>{saving ? 'Đang điều chuyển...' : 'Xác nhận điều chuyển'}</button></footer>
          </form>
        </div>
      )}
    </section>
  );
};

export default LibrarianCopiesPage;
