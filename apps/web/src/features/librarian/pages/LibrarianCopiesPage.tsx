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
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { CopyQrDialog, type CopyQrLabel } from '../components/CopyQrDialog';
import './LibrarianCopiesPage.css';

type CopyCondition = 'New' | 'Good' | 'Fair' | 'LightDamaged' | 'Damaged' | 'Lost';

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
  bookCount: number;
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
  copiesAtLocation: number;
  inWarehouseCopies: number;
  unavailableCopies: number;
}

interface CategoryOption {
  id: string;
  name: string;
  code: string;
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
const CONDITIONS: CopyCondition[] = ['New', 'Good', 'Fair', 'LightDamaged', 'Damaged', 'Lost'];
const conditionLabels: Record<CopyCondition, string> = {
  New: 'Mới',
  Good: 'Tốt',
  Fair: 'Trung bình',
  LightDamaged: 'Hư nhẹ — còn sử dụng được',
  Damaged: 'Hư hỏng / chờ kiểm tra',
  Lost: 'Thất lạc',
};

const LibrarianCopiesPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const { showToast } = useToast();
  const [tab, setTab] = useState<'copies' | 'sorting' | 'locations'>(() => new URLSearchParams(window.location.search).get('tab') === 'sorting' ? 'sorting' : 'copies');
  const [copies, setCopies] = useState<CopyItem[]>([]);
  const [qrCopy, setQrCopy] = useState<CopyQrLabel | null>(null);
  const [bookGroups, setBookGroups] = useState<BookCopyGroup[]>([]);
  const [copyBookSearch, setCopyBookSearch] = useState('');
  const [selectedCopyBook, setSelectedCopyBook] = useState<BookCopyGroup | null>(null);
  const [bookGroupsLoading, setBookGroupsLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [copyBookCategory, setCopyBookCategory] = useState('');
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
  const [newBookOpen, setNewBookOpen] = useState(() => new URLSearchParams(window.location.search).get('newBook') === '1');
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookCode, setNewBookCode] = useState('');
  const [newBookCodeState, setNewBookCodeState] = useState<'idle' | 'checking' | 'available' | 'error'>('idle');
  const [newBookCodeRefresh, setNewBookCodeRefresh] = useState(0);
  const [newBookCodeError, setNewBookCodeError] = useState('');
  const [newBookAuthor, setNewBookAuthor] = useState('');
  const [newBookIsbn, setNewBookIsbn] = useState('');
  const [newBookYear, setNewBookYear] = useState('');
  const [newBookLanguage, setNewBookLanguage] = useState('vi');
  const [newBookCategoryIds, setNewBookCategoryIds] = useState<string[]>(() => {
    const categoryId = new URLSearchParams(window.location.search).get('categoryId');
    return categoryId ? [categoryId] : [];
  });
  const [newBookCodeCategoryId, setNewBookCodeCategoryId] = useState(() => new URLSearchParams(window.location.search).get('categoryId') || '');
  const [newBookQuantity, setNewBookQuantity] = useState(1);
  const [newBookDescription, setNewBookDescription] = useState('');
  const [newBookCover, setNewBookCover] = useState<File | null>(null);
  const [newBookCoverPreview, setNewBookCoverPreview] = useState('');
  const [sortingBooksRefresh, setSortingBooksRefresh] = useState(0);
  const [editCopy, setEditCopy] = useState<CopyItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [bookOptions, setBookOptions] = useState<BookOption[]>([]);
  const [bookSearch, setBookSearch] = useState('');
  const [debouncedBookSearch, setDebouncedBookSearch] = useState('');
  const [intakeBookId, setIntakeBookId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [intakeCondition, setIntakeCondition] = useState<CopyCondition>('New');
  const [editLocation, setEditLocation] = useState('');
  const [editCondition, setEditCondition] = useState<CopyCondition>('Good');
  const [selectedCopyIds, setSelectedCopyIds] = useState<string[]>([]);
  const [transferLocations, setTransferLocations] = useState<Record<string, string>>({});
  const [transferOpen, setTransferOpen] = useState(false);
  const [commonShelf, setCommonShelf] = useState('');
  const [sortingSearch, setSortingSearch] = useState('');
  const [sortingBooks, setSortingBooks] = useState<SortingBookOption[]>([]);
  const [sortingBooksLoading, setSortingBooksLoading] = useState(false);
  const [sortingBookId, setSortingBookId] = useState('');
  const [sortingDetails, setSortingDetails] = useState<SortingBookDetails | null>(null);
  const [sortingSelected, setSortingSelected] = useState<string[]>([]);
  const [sortingDestinations, setSortingDestinations] = useState<Record<string, string>>({});
  const [sortingLoading, setSortingLoading] = useState(false);
  const [shelfSearch, setShelfSearch] = useState('');
  const [shelfFloor, setShelfFloor] = useState('all');
  const [selectedShelf, setSelectedShelf] = useState<StorageLocation | null>(null);
  const [shelfBookGroups, setShelfBookGroups] = useState<BookCopyGroup[]>([]);
  const [shelfBooksLoading, setShelfBooksLoading] = useState(false);
  const [selectedShelfBook, setSelectedShelfBook] = useState<BookCopyGroup | null>(null);
  const [shelfCopies, setShelfCopies] = useState<CopyItem[]>([]);
  const [shelfCopiesLoading, setShelfCopiesLoading] = useState(false);

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
    if (selectedLocation) params.set('location', selectedLocation);
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
      if (copyBookCategory) params.set('categoryId', copyBookCategory);
      if (selectedLocation) params.set('location', selectedLocation);
      const response = await fetch(`${API_BASE_URL}/api/v1/copies/book-groups?${params}`, { headers });
      const result = await parseApiResponse<Envelope<BookCopyGroup[]>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tải danh sách đầu sách.');
      setBookGroups(result.data ?? []);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Không thể tải danh sách đầu sách.';
      setError(message);
      showToast({ type: 'error', title: 'Lỗi tải đầu sách', message });
    } finally { setBookGroupsLoading(false); }
  }, [copyBookCategory, copyBookSearch, headers, selectedLocation, showToast]);

  const selectedCopyBookId = selectedCopyBook?.id;
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
      await fetchInventory(selectedCopyBookId);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Không thể tải dữ liệu kho.';
      setError(message);
      showToast({ type: 'error', title: 'Lỗi tải kho sách', message });
    } finally {
      setLoading(false);
    }
  }, [fetchInventory, headers, selectedCopyBookId, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (tab === 'copies' && !selectedCopyBook) void Promise.resolve().then(fetchBookGroups);
  }, [fetchBookGroups, selectedCopyBook, tab]);

  useEffect(() => {
    if (tab !== 'locations' || !selectedShelf || selectedShelfBook) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ location: selectedShelf.name });
        const response = await fetch(`${API_BASE_URL}/api/v1/copies/book-groups?${params}`, { headers });
        const result = await parseApiResponse<Envelope<BookCopyGroup[]>>(response);
        if (!response.ok || !result?.success) throw new Error(result?.error || 'KhÃ´ng thá»ƒ táº£i danh sÃ¡ch Ä‘áº§u sÃ¡ch trÃªn ká»‡.');
        if (!cancelled) setShelfBookGroups(result.data ?? []);
      } catch (caught) {
        if (!cancelled) showToast({ type: 'error', title: 'KhÃ´ng thá»ƒ táº£i sÃ¡ch trÃªn ká»‡', message: caught instanceof Error ? caught.message : 'Vui lÃ²ng thá»­ láº¡i.' });
      } finally {
        if (!cancelled) setShelfBooksLoading(false);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [headers, selectedShelf, selectedShelfBook, showToast, tab]);

  useEffect(() => {
    if (tab !== 'locations' || !selectedShelf || !selectedShelfBook) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          page: '1',
          pageSize: '500',
          location: selectedShelf.name,
          bookId: selectedShelfBook.id,
        });
        const response = await fetch(`${API_BASE_URL}/api/v1/copies?${params}`, { headers });
        const result = await parseApiResponse<Envelope<CopyItem[]>>(response);
        if (!response.ok || !result?.success) throw new Error(result?.error || 'KhÃ´ng thá»ƒ táº£i báº£n sao Ä‘ang á»Ÿ ká»‡.');
        if (!cancelled) setShelfCopies(result.data ?? []);
      } catch (caught) {
        if (!cancelled) showToast({ type: 'error', title: 'KhÃ´ng thá»ƒ táº£i báº£n sao', message: caught instanceof Error ? caught.message : 'Vui lÃ²ng thá»­ láº¡i.' });
      } finally {
        if (!cancelled) setShelfCopiesLoading(false);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [headers, selectedShelf, selectedShelfBook, showToast, tab]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${API_BASE_URL}/api/v1/categories`, { headers })
      .then(async response => {
        const result = await parseApiResponse<Envelope<CategoryOption[]>>(response);
        if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tải danh mục sách.');
        if (!cancelled) setCategories(result.data ?? []);
      })
      .catch(caught => { if (!cancelled) showToast({ type: 'error', title: 'Không thể tải danh mục', message: caught instanceof Error ? caught.message : 'Vui lòng thử lại.' }); });
    return () => { cancelled = true; };
  }, [headers, showToast]);

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
      } finally {
        if (!cancelled) setSortingBooksLoading(false);
      }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [headers, showToast, sortingBooksRefresh, sortingSearch, tab]);

  useEffect(() => {
    if (!newBookOpen || !newBookCodeCategoryId) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!cancelled) { setNewBookCodeState('checking'); setNewBookCode(''); setNewBookCodeError(''); }
      try {
        const params = new URLSearchParams({ categoryId: newBookCodeCategoryId });
        const response = await fetch(`${API_BASE_URL}/api/v1/books/next-code?${params}`, { headers });
        const result = await parseApiResponse<Envelope<{ code: string }>>(response);
        if (!response.ok || !result?.success || !result.data?.code) throw new Error(result?.error || 'Không thể lấy mã sách tự động.');
        if (!cancelled) { setNewBookCode(result.data.code); setNewBookCodeState('available'); }
      } catch (caught) {
        if (!cancelled) { setNewBookCodeState('error'); setNewBookCodeError(caught instanceof Error ? caught.message : 'Không thể lấy mã sách tự động.'); }
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [headers, newBookCodeCategoryId, newBookCodeRefresh, newBookOpen]);

  useEffect(() => {
    if (tab !== 'sorting' || !sortingBookId) return;
    let cancelled = false;
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
          location: null,
          shelfQuantity: 0,
          condition: intakeCondition,
        }),
      });
      const result = await parseApiResponse<Envelope<{ addedCopies: number }>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể nhập bản sao.');
      showToast({
        type: 'success',
        title: 'Đã nhập bản sao',
        message: `Đã nhập ${result.data?.addedCopies ?? quantity} bản sao vào kho để sắp xếp sau.`,
      });
      setIntakeOpen(false);
      setIntakeBookId('');
      setBookSearch('');
      setQuantity(1);
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

  const closeNewBookForm = () => {
    setNewBookOpen(false);
    const params = new URLSearchParams(window.location.search);
    params.delete('newBook');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  };

  const handleCreateAndIntakeBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = newBookCode.trim();
    if (!newBookTitle.trim() || !newBookCategoryIds.includes(newBookCodeCategoryId) || !code || newBookCodeState !== 'available') return;
    if (newBookQuantity < 1 || newBookQuantity > 500) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.append('Code', code);
      body.append('CodeCategoryId', newBookCodeCategoryId);
      body.append('Title', newBookTitle.trim());
      if (newBookAuthor.trim()) body.append('AuthorName', newBookAuthor.trim());
      if (newBookIsbn.trim()) body.append('Isbn', newBookIsbn.trim());
      if (newBookYear) body.append('PublishedYear', newBookYear);
      body.append('Language', newBookLanguage);
      body.append('TotalCopies', String(newBookQuantity));
      body.append('ShelfQuantity', '0');
      newBookCategoryIds.forEach(categoryId => body.append('CategoryIds', categoryId));
      if (newBookDescription.trim()) body.append('Description', newBookDescription.trim());
      if (newBookCover) body.append('CoverImage', newBookCover);
      const response = await fetch(`${API_BASE_URL}/api/v1/books/form`, { method: 'POST', headers, body });
      const result = await parseApiResponse<Envelope<{ id: string; title: string }>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể tạo đầu sách và nhập vào kho.');
      showToast({ type: 'success', title: 'Đã nhập đầu sách mới', message: `Đã tạo “${newBookTitle.trim()}” cùng ${newBookQuantity} bản sao trong kho. Chọn Xem QR tại bản sao để mở mã.` });
      if (newBookCoverPreview) URL.revokeObjectURL(newBookCoverPreview);
      setNewBookTitle(''); setNewBookCode(''); setNewBookCodeState('idle'); setNewBookAuthor(''); setNewBookIsbn(''); setNewBookYear(''); setNewBookLanguage('vi'); setNewBookCategoryIds([]); setNewBookQuantity(1); setNewBookDescription(''); setNewBookCover(null); setNewBookCoverPreview('');
      setNewBookCodeCategoryId('');
      closeNewBookForm();
      setTab('sorting');
      setSortingSearch('');
      if (result.data?.id) {
        setSortingDetails(null);
        setSortingSelected([]);
        setSortingDestinations({});
        setSortingLoading(true);
        setSortingBookId(result.data.id);
      }
      await refreshData();
      setSortingBooksRefresh(current => current + 1);
    } catch (caught) {
      showToast({ type: 'error', title: 'Nhập đầu sách thất bại', message: caught instanceof Error ? caught.message : 'Vui lòng kiểm tra lại thông tin.' });
    } finally { setSaving(false); }
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
    const invalid = assignments.find(item => item.location && !locations.some(shelf => shelf.name === item.location));
    if (invalid) { showToast({ type: 'error', title: 'Kệ không còn khả dụng', message: 'Hãy tải lại danh sách và chọn kệ khác.' }); return; }
    const full = locations.find(shelf => assignments.filter(item => item.location === shelf.name).length > shelf.availableCapacity);
    if (full) { showToast({ type: 'error', title: 'Kệ không đủ chỗ', message: `${full.name} chỉ còn ${full.availableCapacity} chỗ. Hãy giảm số bản sao hoặc chọn kệ khác.` }); return; }
    if (assignments.length > 500) { showToast({ type: 'error', title: 'Chọn tối đa 500 bản sao mỗi lần', message: 'Hãy chia thành các đợt xếp kệ nhỏ hơn.' }); return; }
    if (!window.confirm(`Xác nhận cập nhật ${assignments.length} bản sao? ${assignments.filter(item => !item.location).length} bản tiếp tục ở kho.`)) return;
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
      if (selectedCopyBook) {
        // The copy table is refreshed by refreshData, but its selected group is a
        // separate snapshot. Reload the aggregate so on-shelf/warehouse counts
        // immediately match the copies just moved.
        const params = new URLSearchParams({ search: selectedCopyBook.code });
        const groupsResponse = await fetch(`${API_BASE_URL}/api/v1/copies/book-groups?${params}`, { headers });
        const groupsResult = await parseApiResponse<Envelope<BookCopyGroup[]>>(groupsResponse);
        if (groupsResponse.ok && groupsResult?.success) {
          const groups = groupsResult.data ?? [];
          setBookGroups(groups);
          const updatedBook = groups.find(book => book.id === selectedCopyBook.id);
          if (updatedBook) setSelectedCopyBook(updatedBook);
        }
      }
      showToast({ type: 'success', title: 'Điều chuyển thành công', message: `Đã cập nhật ${result.data?.movedCopies ?? assignments.length} bản sao.` });
    } catch (caught) {
      showToast({ type: 'error', title: 'Điều chuyển thất bại', message: caught instanceof Error ? caught.message : 'Không thể điều chuyển bản sao.' });
    } finally { setSaving(false); }
  };

  const startLoading = (nextPage: number) => {
    setPage(nextPage);
    setLoading(true);
  };

  const isShelfBookDetailPage = tab === 'locations' && selectedShelf !== null && selectedShelfBook !== null;

  return (
    <section className={`lib-copies-page${isShelfBookDetailPage ? ' lib-copies-page--shelf-copy-detail' : ''}`}>
      <header className="lib-copies-heading">
        <div>
          <p className="lib-copies-eyebrow"><Archive size={15} /> KHÔNG GIAN THỦ THƯ · QUẢN LÝ SÁCH</p>
          <h1>Quản lý bản sao, kho và kệ sách</h1>
          <span>Theo dõi từng cuốn sách, xử lý sách trong kho và kiểm soát sức chứa từng kệ.</span>
        </div>
        <button type="button" className="lib-copies-primary" onClick={() => setIntakeOpen(true)}>
          <PackagePlus size={17} /> Nhập thêm bản sao
        </button>
      </header>

      <section className="lib-copies-metrics" aria-label="Thống kê kho sách">
        <article><span className="lib-copies-metric-icon"><BookCopy size={19} /></span><span>Tổng số bản sao</span><strong>{summary?.totalCopies ?? '—'}</strong></article>
        <article><span className="lib-copies-metric-icon is-green"><Check size={19} /></span><span>Sẵn sàng trên kệ</span><strong>{summary?.availableCopies ?? '—'}</strong></article>
        <article><span className="lib-copies-metric-icon is-blue"><Boxes size={19} /></span><span>Trong kho chờ xếp</span><strong>{summary?.warehouseCopies ?? '—'}</strong></article>
        <article><span className="lib-copies-metric-icon is-slate"><Archive size={19} /></span><span>Đang mượn hoặc cần xử lý</span><strong>{summary?.unavailableCopies ?? '—'}</strong></article>
      </section>

      <div className="lib-copies-tabs" role="tablist" aria-label="Chế độ xem kho">
        <button type="button" role="tab" aria-selected={tab === 'copies'} className={tab === 'copies' ? 'is-active' : ''} onClick={() => setTab('copies')}>
          <BookCopy size={16} /> Danh sách bản sao
        </button>
        <button type="button" role="tab" aria-selected={tab === 'sorting'} className={tab === 'sorting' ? 'is-active' : ''} onClick={() => { setSortingBooksLoading(true); setSortingLoading(Boolean(sortingBookId)); setTab('sorting'); }}>
          <Boxes size={16} /> Quản lý kho
        </button>
        <button type="button" role="tab" aria-selected={tab === 'locations'} className={tab === 'locations' ? 'is-active' : ''} onClick={() => setTab('locations')}>
          <MapPin size={16} /> Quản lý kệ sách
        </button>
      </div>

      <section className="lib-copies-panel">
        {tab === 'copies' ? (
          <>
            <div className="lib-copies-toolbar">
              {selectedCopyBook && <button type="button" className="lib-copies-back-books" onClick={() => { setSelectedCopyBook(null); setCopies([]); setSelectedCopyIds([]); setSearch(''); setDebouncedSearch(''); }}><ChevronLeft size={16} /> Quay lại danh sách</button>}
              <label className="lib-copies-search">
                <Search size={17} />
                <input value={selectedCopyBook ? search : copyBookSearch} onChange={(event) => selectedCopyBook ? setSearch(event.target.value) : setCopyBookSearch(event.target.value)} placeholder={selectedCopyBook ? 'Tìm mã bản sao hoặc vị trí...' : 'Tìm đầu sách theo tên hoặc mã...'} />
              </label>
              {!selectedCopyBook && <label className="lib-copies-category-filter"><span>Danh mục</span><select value={copyBookCategory} onChange={event => setCopyBookCategory(event.target.value)}><option value="">Tất cả danh mục</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
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
            {selectedLocation && !selectedCopyBook && <div className="lib-copies-location-context"><MapPin size={17} /><span>{selectedLocation === '__warehouse__' ? 'Các đầu sách đang có bản trong kho' : <>Đang xem sách tại <strong>{selectedLocation}</strong></>}</span><button type="button" onClick={() => setSelectedLocation('')}>Xem toàn bộ đầu sách</button></div>}
            {selectedCopyBook && <div className="lib-copies-selected-book"><div><span>{selectedLocation && selectedLocation !== '__warehouse__' ? 'SÁCH TRÊN KỆ ĐANG XEM' : 'ĐẦU SÁCH ĐANG XEM'}</span><strong>{selectedCopyBook.title}</strong><small>{selectedCopyBook.code} · {selectedCopyBook.totalCopies} cuốn · {selectedLocation ? `${selectedCopyBook.copiesAtLocation} cuốn tại vị trí đang lọc` : `${selectedCopyBook.onShelfCopies} trên kệ · ${selectedCopyBook.inWarehouseCopies} trong kho`}</small></div></div>}
            {selectedCopyBook && !loading && copies.length > 0 && <div className="lib-copies-select-page"><label><input type="checkbox" checked={copies.every(copy => selectedCopyIds.includes(copy.id))} onChange={event => setSelectedCopyIds(event.target.checked ? [...new Set([...selectedCopyIds, ...copies.map(copy => copy.id)])] : selectedCopyIds.filter(id => !copies.some(copy => copy.id === id)))} /><span><strong>Chọn tất cả bản sao đang hiển thị</strong><small>Chỉ chọn các bản sao trên trang này</small></span></label><span>{copies.length} bản sao trên trang</span></div>}
            {selectedCopyBook && selectedCopyIds.length > 0 && <div className="lib-copies-selection-bar"><div className="lib-copies-selection-count"><span className="lib-copies-selection-check"><Check size={16} /></span><span><strong>{selectedCopyIds.length} bản sao được chọn</strong><small>Thao tác áp dụng cho các bản sao đã chọn trong đầu sách này.</small></span></div><div><button type="button" onClick={() => { setTransferLocations(Object.fromEntries(selectedCopyIds.map(id => [id, '']))); setTransferOpen(true); }}>Điều chuyển vị trí</button><button type="button" className="is-quiet" onClick={() => setSelectedCopyIds([])}>Bỏ chọn</button></div></div>}
            {error && <div className="lib-copies-error" role="alert">{error}<button type="button" onClick={() => void refreshData()}>Thử lại</button></div>}
            {!selectedCopyBook ? (bookGroupsLoading ? (
              <div className="lib-copies-loading" role="status"><span /><p>Đang tải danh sách đầu sách...</p></div>
            ) : bookGroups.length ? <div className="lib-copies-book-groups">{bookGroups.map(book => <button type="button" className="lib-copies-book-group" key={book.id} onClick={() => { setSelectedCopyBook(book); setPage(1); setLoading(true); setSearch(''); setDebouncedSearch(''); }}>
              <span className="lib-copies-book-group-icon"><BookCopy size={20} /></span><span className="lib-copies-book-group-main"><strong>{book.title}</strong><small>Mã đầu sách: {book.code}</small></span><span className="lib-copies-book-group-count"><strong>{selectedLocation ? book.copiesAtLocation : book.totalCopies}</strong><small>{selectedLocation ? 'cuốn tại đây' : 'cuốn sách'}</small></span><span className="lib-copies-book-group-breakdown">{selectedLocation ? <span>{book.copiesAtLocation} cuốn tại vị trí đang xem</span> : <><span>{book.onShelfCopies} trên kệ</span><span>{book.inWarehouseCopies} trong kho</span><span>{book.unavailableCopies} chưa thể cho mượn</span></>}</span><ChevronRight size={18} />
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
                      <td><span className={`lib-copy-availability ${copy.isAvailable && copy.condition !== 'Damaged' && copy.condition !== 'Lost' ? 'is-available' : 'is-unavailable'}`}>{copy.condition === 'Lost' ? 'Thất lạc' : copy.condition === 'Damaged' ? 'Hư hỏng' : copy.isAvailable ? 'Sẵn sàng' : 'Đang mượn / khóa'}</span></td>
                      <td><div className="lib-copy-actions"><button type="button" className="lib-copy-qr" onClick={() => setQrCopy(copy)} aria-label={`Xem mã QR ${copy.barcode}`}>Xem QR</button><button type="button" className="lib-copy-edit" onClick={() => openEdit(copy)}>Sửa vị trí</button></div></td>
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
              <div><strong>Quản lý kho sách</strong><p>Chọn đầu sách để xếp bản sao lên kệ.</p><button type="button" className="lib-copies-primary" onClick={() => setNewBookOpen(true)}><Plus size={16} /> Tạo đầu sách mới và nhập kho</button></div>
              {!sortingBookId && <label className="lib-copies-search"><Search size={17} /><input value={sortingSearch} onChange={event => { setSortingBooksLoading(true); setSortingSearch(event.target.value); }} placeholder="Tìm đầu sách trong kho theo tên hoặc mã..." /></label>}
            </header>
            {!sortingBookId ? sortingBooksLoading ? (
              <div className="lib-copies-loading" role="status"><span /><p>Đang tải danh sách sách trong kho...</p></div>
            ) : sortingBooks.length ? <>
              <div className="lib-copies-warehouse-summary">
                <article><span>Đầu sách có bản trong kho</span><strong>{sortingBooks.length}</strong></article>
                <article><span>Bản sao sẵn sàng trong kho</span><strong>{summary?.warehouseCopies ?? 0}</strong></article>
                <article><span>Kệ còn chỗ nhận sách</span><strong>{locations.filter(location => location.availableCapacity > 0).length}</strong></article>
              </div>
              {restockAlerts.length > 0 && <section className="lib-copies-restock-alerts" aria-label="Đầu sách cần bổ sung lên kệ"><strong>Cần bổ sung sách lên kệ</strong><p>Các đầu sách này đã hết bản sẵn sàng trên kệ nhưng vẫn còn sách trong kho.</p>{restockAlerts.map(alert => <div key={alert.id}><span><b>{alert.title}</b><small>Còn {alert.inWarehouse} bản trong kho · chưa có bản sẵn sàng trên kệ</small></span><button type="button" onClick={() => { setSortingBookId(alert.id); setSortingDetails(null); setSortingSelected([]); setSortingDestinations({}); setSortingLoading(true); }}>Xếp sách lên kệ</button></div>)}</section>}
              <div className="lib-copies-warehouse-list">
                {sortingBooks.map(book => <article key={book.id}>
                  <div className="lib-copies-warehouse-book"><span className="lib-copies-book-group-icon"><BookCopy size={19} /></span><span><strong>{book.title}</strong><small>Mã đầu sách: {book.code}</small></span></div>
                  <div className="lib-copies-warehouse-counts"><span><strong>{book.inWarehouseCopies}</strong><small>trong kho</small></span><span><strong>{book.onShelfCopies}</strong><small>trên kệ</small></span></div>
                  <button type="button" onClick={() => { setSortingBookId(book.id); setSortingDetails(null); setSortingSelected([]); setSortingDestinations({}); setSortingLoading(true); }}>Xem bản sao và xếp kệ <ChevronRight size={16} /></button>
                </article>)}
              </div>
            </> : <div className="lib-copies-empty"><Boxes size={30} /><strong>{sortingSearch.trim() ? 'Không tìm thấy đầu sách phù hợp' : 'Kho chưa có bản sao chờ xếp'}</strong><p>{sortingSearch.trim() ? 'Thử tìm theo tên khác hoặc mã đầu sách.' : 'Các bản sao mới nhập hoặc được trả về kho sẽ xuất hiện tại đây để thủ thư sắp xếp.'}</p></div> : sortingLoading ? (
              <div className="lib-copies-loading" role="status"><span /><p>Đang tải bản sao...</p></div>
            ) : sortingDetails ? <>
              <div className="lib-copies-warehouse-detail-heading"><button type="button" className="lib-copies-back-books" onClick={() => { setSortingBookId(''); setSortingDetails(null); setSortingSelected([]); setSortingDestinations({}); }}><ChevronLeft size={16} /> Quay lại danh sách kho</button><div><small>ĐẦU SÁCH ĐANG QUẢN LÝ</small><h3>{sortingDetails.title}</h3><span>{sortingDetails.code} · {sortingDetails.inWarehouseCopies} bản trong kho</span></div></div>
              <div className="lib-copies-sorting-stats"><article><span>Đã xếp trên kệ</span><strong>{sortingDetails.onShelfCopies}</strong></article><article><span>Đang trong kho, chờ xếp</span><strong>{sortingDetails.inWarehouseCopies}</strong></article><article><span>Bản trả về đang chờ xếp</span><strong>{sortingDetails.returnedInWarehouseCopies}</strong></article></div>
              <div className="lib-copies-sorting-toolbar"><span>Chọn bản sao, áp dụng kệ chung hoặc chọn riêng từng cuốn.</span><div className="lib-copies-sorting-actions"><button type="button" className="is-secondary" disabled={!sortingDetails.copies.length || saving} onClick={() => setSortingSelected(sortingDetails.copies.every(copy => sortingSelected.includes(copy.id)) ? [] : sortingDetails.copies.map(copy => copy.id))}>{sortingDetails.copies.length > 0 && sortingDetails.copies.every(copy => sortingSelected.includes(copy.id)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button><button type="button" disabled={!sortingSelected.length || saving} onClick={() => void handleSaveSorting()}>{saving ? 'Đang lưu...' : `Lưu thay đổi (${sortingSelected.length})`}</button></div></div>
              <div className="lib-copies-bulk-shelf">
                <label htmlFor="sorting-common-shelf">Kệ chung cho {sortingSelected.length} bản đã chọn</label>
                <select id="sorting-common-shelf" value={commonShelf} disabled={saving} onChange={event => setCommonShelf(event.target.value)}>
                  <option value="">Chọn kệ...</option>
                  {locations.filter(location => location.availableCapacity > 0).map(location => <option key={location.id} value={location.name}>{location.name} · còn {location.availableCapacity} chỗ</option>)}
                </select>
                <button type="button" disabled={saving || !sortingSelected.length || !commonShelf || sortingSelected.length > (locations.find(location => location.name === commonShelf)?.availableCapacity ?? 0)} onClick={() => setSortingDestinations(current => ({ ...current, ...Object.fromEntries(sortingSelected.map(id => [id, commonShelf])) }))}>Áp dụng kệ cho các bản đã chọn</button>
                {commonShelf && sortingSelected.length > (locations.find(location => location.name === commonShelf)?.availableCapacity ?? 0) && <p role="status">Kệ không đủ chỗ cho {sortingSelected.length} bản. Chọn kệ khác hoặc giảm số bản đã chọn.</p>}
                <small>Áp dụng để xem trước; nhấn Lưu thay đổi để xác nhận.</small>
              </div>
              <div className="lib-copies-sorting-list" aria-busy={saving}>
                {sortingDetails.copies.map(copy => <article key={copy.id}>
                  <label><input type="checkbox" disabled={saving} checked={sortingSelected.includes(copy.id)} onChange={event => setSortingSelected(current => event.target.checked ? [...new Set([...current, copy.id])] : current.filter(id => id !== copy.id))} /><span><strong>{copy.barcode}</strong><small>{conditionLabels[copy.condition]} · {copy.hasBeenReturned ? 'Đã trả về' : 'Chưa có lượt mượn'}</small></span></label>
                  <button type="button" className="lib-copy-qr" onClick={() => setQrCopy({ barcode: copy.barcode, bookTitle: sortingDetails.title })} aria-label={`Xem mã QR ${copy.barcode}`}>Xem QR</button>
                  <select disabled={saving} aria-label={`Vị trí của bản sao ${copy.barcode}`} value={sortingDestinations[copy.id] ?? ''} onChange={event => setSortingDestinations(current => ({ ...current, [copy.id]: event.target.value }))}>
                    <option value="">Giữ trong kho</option>
                    {locations.filter(location => location.availableCapacity > 0).map(location => <option key={location.id} value={location.name}>{location.name} · còn {location.availableCapacity} chỗ</option>)}
                  </select>
                </article>)}
                {!sortingDetails.copies.length && <div className="lib-copies-empty"><Check size={30} /><strong>Không còn bản sao trong kho cần sắp xếp</strong></div>}
              </div>
            </> : null}
          </div>
        ) : selectedShelf ? (
          <div className="lib-copies-shelf-detail">
            <header className="lib-copies-shelf-detail-header">
              <button type="button" className="lib-copies-back-books" onClick={() => {
                if (selectedShelfBook) {
                  setSelectedShelfBook(null);
                  setShelfCopies([]);
                  setShelfBooksLoading(true);
                } else {
                  setSelectedShelf(null);
                }
              }}>
                <ChevronLeft size={16} /> {selectedShelfBook ? 'Quay lại danh sách đầu sách' : 'Quay lại danh sách kệ'}
              </button>
              {selectedShelfBook && <small className="lib-copies-shelf-detail-eyebrow">CHI TIẾT BẢN SAO TRÊN KỆ</small>}
              <div>
                <span><MapPin size={16} /> {selectedShelf.name}</span>
                <h2>{selectedShelfBook ? selectedShelfBook.title : 'Sách đang xếp trên kệ'}</h2>
                <p>{selectedShelfBook
                  ? `${selectedShelfBook.copiesAtLocation} bản sao của đầu sách này đang ở kệ.`
                  : `${selectedShelf.bookCount} đầu sách · ${selectedShelf.copyCount}/${selectedShelf.capacity} bản sao.`}</p>
              </div>
            </header>

            {selectedShelfBook ? (
              shelfCopiesLoading ? (
                <div className="lib-copies-loading" role="status"><span /><p>Đang tải bản sao trên kệ...</p></div>
              ) : shelfCopies.length ? (
                <div className="lib-copies-table-wrap">
                  <table className="lib-copies-table">
                    <thead><tr><th>Mã bản sao</th><th>Tình trạng</th><th>Khả dụng</th><th>Ngày nhập</th><th>Mã QR</th></tr></thead>
                    <tbody>{shelfCopies.map(copy => (
                      <tr key={copy.id}>
                        <td><code>{copy.barcode}</code></td>
                        <td><span className={`lib-copy-condition is-${copy.condition.toLowerCase()}`}>{conditionLabels[copy.condition]}</span></td>
                        <td><span className={`lib-copy-availability ${copy.isAvailable && copy.condition !== 'Damaged' && copy.condition !== 'Lost' ? 'is-available' : 'is-unavailable'}`}>{copy.condition === 'Lost' ? 'Thất lạc' : copy.condition === 'Damaged' ? 'Hư hỏng' : copy.isAvailable ? 'Sẵn sàng' : 'Đang mượn / khóa'}</span></td>
                        <td>{new Date(copy.createdAt).toLocaleDateString('vi-VN')}</td>
                        <td><button type="button" className="lib-copy-qr" onClick={() => setQrCopy(copy)} aria-label={`Xem mã QR ${copy.barcode}`}>Xem QR</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (
                <div className="lib-copies-empty"><Archive size={30} /><strong>Không còn bản sao nào của đầu sách này trên kệ</strong><p>Dữ liệu vị trí có thể vừa được thay đổi. Hãy tải lại danh sách kệ.</p></div>
              )
            ) : shelfBooksLoading ? (
              <div className="lib-copies-loading" role="status"><span /><p>Đang tải đầu sách trên kệ...</p></div>
            ) : shelfBookGroups.length ? (
              <div className="lib-copies-book-groups">
                {shelfBookGroups.map(book => (
                  <button type="button" className="lib-copies-book-group" key={book.id} onClick={() => {
                    setSelectedShelfBook(book);
                    setShelfCopies([]);
                    setShelfCopiesLoading(true);
                  }}>
                    <span className="lib-copies-book-group-icon"><BookCopy size={20} /></span>
                    <span className="lib-copies-book-group-main"><strong>{book.title}</strong><small>Mã đầu sách: {book.code}</small></span>
                    <span className="lib-copies-book-group-count"><strong>{book.copiesAtLocation}</strong><small>bản sao</small></span>
                    <span className="lib-copies-book-group-breakdown"><span>Đang ở {selectedShelf.name}</span></span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="lib-copies-empty"><BookCopy size={30} /><strong>Kệ này chưa có đầu sách</strong><p>Kệ đang trống hoặc chưa có bản sao nào được xếp vào vị trí này.</p></div>
            )}
          </div>
        ) : (
          <div className="lib-copies-location-grid">
            <div className="lib-copies-shelf-actions"><div><strong>Quản lý kệ sách</strong><small>Tạo kệ, đổi tên và sức chứa. Chọn một kệ để xem đầu sách, kiểm tra số chỗ còn lại; chỉ xóa được kệ đang trống.</small></div><button type="button" onClick={() => void handleCreateShelf()}>+ Thêm kệ sách</button></div>
            <div className="lib-copies-shelf-filters">
              <label className="lib-copies-search"><Search size={17} /><input value={shelfSearch} onChange={event => setShelfSearch(event.target.value)} placeholder="Tìm nhanh theo tầng hoặc tên kệ..." /></label>
              <div className="lib-copies-floor-tabs" role="tablist" aria-label="Lọc kệ theo tầng">
                <button type="button" className={shelfFloor === 'all' ? 'is-active' : ''} onClick={() => setShelfFloor('all')}>Tất cả tầng <span>{locations.length}</span></button>
                {shelfFloors.map(floor => <button type="button" key={floor} className={shelfFloor === floor ? 'is-active' : ''} onClick={() => setShelfFloor(floor)}>Tầng {floor} <span>{locations.filter(location => location.name.match(/^Tầng\s+(.+?)\s+·/i)?.[1] === floor).length}</span></button>)}
              </div>
            </div>
            {visibleShelves.length ? visibleShelves.map((location) => (
              <article className="lib-copies-shelf-card" key={location.id}>
                <button type="button" className="lib-copies-shelf-open" aria-label={`Xem ${location.bookCount} đầu sách trên ${location.name}`} onClick={() => { setSelectedShelf(location); setSelectedShelfBook(null); setShelfBookGroups([]); setShelfBooksLoading(true); }}>
                  <span><MapPin size={19} /></span><strong>{location.name}</strong><small>{location.copyCount} cuốn · {location.bookCount} đầu sách · còn {location.availableCapacity} chỗ</small><ChevronRight size={17} />
                  <span className="lib-copies-capacity-track"><i style={{ width: `${Math.min(100, (location.copyCount / location.capacity) * 100)}%` }} /></span>
                </button>
                <button type="button" className="lib-copies-shelf-edit" onClick={() => void handleEditShelf(location)}>Sửa kệ</button>
                <button type="button" className="lib-copies-shelf-delete" disabled={location.copyCount > 0} title={location.copyCount > 0 ? 'Chuyển bản sao khỏi kệ trước khi xóa' : 'Xóa kệ trống'} onClick={() => void handleDeleteShelf(location)}>Xóa kệ</button>
              </article>
            )) : <div className="lib-copies-empty"><MapPin size={30} /><strong>{locations.length ? 'Không tìm thấy kệ phù hợp' : 'Chưa có vị trí lưu trữ'}</strong><p>{locations.length ? 'Thử đổi từ khóa tìm kiếm hoặc chọn tầng khác.' : 'Thêm kệ theo dạng Tầng X · Kệ Y, ví dụ Tầng 4 · Kệ A.'}</p></div>}
          </div>
        )}
      </section>

      {newBookOpen && (
        <div className="lib-copies-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeNewBookForm(); }}>
          <form className="lib-copies-modal lib-copies-new-book-modal" onSubmit={handleCreateAndIntakeBook} role="dialog" aria-modal="true" aria-labelledby="lib-copy-new-book-title">
            <header><div><span><BookCopy size={19} /></span><div><h2 id="lib-copy-new-book-title">Tạo đầu sách mới và nhập kho</h2><p>Điền thông tin sách và số bản nhận về. Tất cả bản sao sẽ được lưu trong kho trước.</p></div></div><button type="button" className="lib-copies-modal-back" onClick={closeNewBookForm}><ChevronLeft size={16} /> Quay lại</button></header>
            <label className="lib-copies-field"><span>Tên sách <b>*</b></span><input value={newBookTitle} onChange={event => setNewBookTitle(event.target.value)} placeholder="Ví dụ: Lập trình C# căn bản" required /></label>
            <fieldset className="lib-copies-category-picker"><legend>Danh mục <b>*</b></legend><p>Chọn danh mục cho đầu sách; một danh mục được dùng để cấp mã.</p><div>{categories.map(category => <label key={category.id}><input type="checkbox" checked={newBookCategoryIds.includes(category.id)} onChange={event => {
              const next = event.target.checked ? [...newBookCategoryIds, category.id] : newBookCategoryIds.filter(id => id !== category.id);
              setNewBookCategoryIds(next);
              if (!next.includes(newBookCodeCategoryId)) { setNewBookCodeCategoryId(next[0] || ''); setNewBookCode(''); setNewBookCodeState('idle'); }
            }} /><span>{category.name} · {category.code}</span></label>)}</div></fieldset>
            {newBookCategoryIds.length > 0 && <label className="lib-copies-field"><span>Danh mục cấp mã <b>*</b></span><select value={newBookCodeCategoryId} onChange={event => { setNewBookCodeCategoryId(event.target.value); setNewBookCode(''); setNewBookCodeState('idle'); }} disabled={saving}>{categories.filter(category => newBookCategoryIds.includes(category.id)).map(category => <option key={category.id} value={category.id}>{category.name} · {category.code}</option>)}</select><small>Các danh mục khác dùng để phân loại thêm. Mã bản sao và QR luôn theo mã đầu sách.</small></label>}
            <div className="lib-copies-form-row">
              <div className="lib-copies-field lib-copies-code-field"><label htmlFor="lib-new-book-code">Mã sách tự động</label><input id="lib-new-book-code" value={newBookCode} readOnly placeholder="Chọn danh mục để cấp mã" aria-describedby="lib-new-book-code-help" /><small id="lib-new-book-code-help">{newBookCodeState === 'checking' ? 'Đang lấy mã còn trống...' : newBookCodeState === 'available' ? 'Số thứ tự còn trống nhỏ nhất của danh mục. Mã chính thức được cấp khi lưu.' : newBookCodeState === 'error' ? newBookCodeError : 'Chọn danh mục cấp mã. Mã sách không nhập thủ công.'}</small>{newBookCodeCategoryId && <button type="button" className="lib-copy-qr" disabled={saving} onClick={() => { setNewBookCodeState('checking'); setNewBookCodeRefresh(value => value + 1); }}>Lấy lại mã tự động</button>}</div>
              <label className="lib-copies-field">Tác giả<input value={newBookAuthor} onChange={event => setNewBookAuthor(event.target.value)} placeholder="Tên tác giả" /></label>
            </div>
            <div className="lib-copies-form-row">
              <label className="lib-copies-field">Mã ISBN<input value={newBookIsbn} onChange={event => setNewBookIsbn(event.target.value)} placeholder="Mã ISBN (nếu có)" /></label>
              <label className="lib-copies-field">Năm xuất bản<input type="number" min={1000} max={new Date().getFullYear() + 1} value={newBookYear} onChange={event => setNewBookYear(event.target.value)} placeholder="Ví dụ: 2026" /></label>
            </div>
            <div className="lib-copies-form-row">
              <label className="lib-copies-field"><span>Số lượng bản sao <b>*</b></span><input type="number" min={1} max={500} value={newBookQuantity} onChange={event => setNewBookQuantity(Number(event.target.value))} required /><small>Mỗi bản có mã riêng. Sau khi tạo, chọn Xem QR để mở mã của từng bản.</small></label>
              <label className="lib-copies-field">Ngôn ngữ<select value={newBookLanguage} onChange={event => setNewBookLanguage(event.target.value)}><option value="vi">Tiếng Việt</option><option value="en">Tiếng Anh</option><option value="ja">Tiếng Nhật</option><option value="ko">Tiếng Hàn</option></select></label>
            </div>
            <label className="lib-copies-field">Mô tả<textarea rows={3} value={newBookDescription} onChange={event => setNewBookDescription(event.target.value)} placeholder="Tóm tắt nội dung sách hoặc ghi chú..." /></label>
            <div className="lib-copies-field">
              <label htmlFor="lib-new-book-cover">Ảnh bìa sách (không bắt buộc)</label>
              <input id="lib-new-book-cover" name="CoverImage" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => {
                const file = event.target.files?.[0];
                if (newBookCoverPreview) URL.revokeObjectURL(newBookCoverPreview);
                setNewBookCover(null); setNewBookCoverPreview('');
                if (!file) return;
                if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
                  showToast({ type: 'error', title: 'Ảnh không hợp lệ', message: 'Chọn ảnh JPG, PNG, WEBP hoặc GIF có dung lượng tối đa 10 MB.' });
                  event.target.value = ''; return;
                }
                setNewBookCover(file); setNewBookCoverPreview(URL.createObjectURL(file));
              }} />
              <small>JPG, PNG, WEBP hoặc GIF · tối đa 10 MB. Bỏ trống vẫn tạo được sách, bản sao và QR.</small>
              {newBookCoverPreview && <div className="lib-copies-cover-preview"><img className="lib-copies-new-book-cover" src={newBookCoverPreview} alt="Ảnh bìa xem trước" /><button type="button" className="lib-copy-qr" disabled={saving} onClick={event => {
                URL.revokeObjectURL(newBookCoverPreview);
                setNewBookCover(null); setNewBookCoverPreview('');
                const input = event.currentTarget.form?.elements.namedItem('CoverImage');
                if (input instanceof HTMLInputElement) input.value = '';
              }}>Bỏ ảnh đã chọn</button></div>}
            </div>
            <aside className="lib-copies-intake-note">Nhập kho trước: sách chưa lên kệ sẽ chưa thể cho mượn. Sau khi nhận sách, vào danh sách kho để sắp xếp từng bản sao lên kệ.</aside>
            <footer><button type="button" onClick={closeNewBookForm}>Hủy</button><button type="submit" disabled={saving || newBookCodeState !== 'available' || newBookCategoryIds.length === 0 || newBookQuantity < 1 || newBookQuantity > 500}>{saving ? 'Đang nhập...' : 'Tạo đầu sách và nhập kho'}</button></footer>
          </form>
        </div>
      )}

      {intakeOpen && (
        <div className="lib-copies-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIntakeOpen(false); }}>
          <form className="lib-copies-modal" onSubmit={handleIntake} role="dialog" aria-modal="true" aria-labelledby="lib-copy-intake-title">
            <header><div><span><PackagePlus size={19} /></span><div><h2 id="lib-copy-intake-title">Nhập thêm bản sao vào kho</h2><p>Chọn đầu sách đã có và số lượng cần nhập. Tất cả bản sao sẽ ở trong kho để thủ thư sắp xếp sau.</p></div></div><button type="button" onClick={() => setIntakeOpen(false)} aria-label="Đóng"><X size={19} /></button></header>
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
            <aside className="lib-copies-intake-note">Mỗi bản sao được tạo mã riêng và lưu trong kho; sau đó chọn đầu sách trong tab Quản lý kho để xếp từng cuốn lên kệ.</aside>
            <footer><button type="button" onClick={() => setIntakeOpen(false)}>Hủy</button><button type="submit" disabled={saving || !intakeBookId || quantity < 1 || quantity > 500}><PackagePlus size={16} />{saving ? 'Đang nhập...' : 'Nhập vào kho'}</button></footer>
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
      <CopyQrDialog copy={qrCopy} onClose={() => setQrCopy(null)} />
    </section>
  );
};

export default LibrarianCopiesPage;
