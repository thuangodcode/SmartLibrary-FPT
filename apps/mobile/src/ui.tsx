import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, Search, Bell, Home, ClipboardList, CircleUserRound, ArrowUpRight, Clock3, BookMarked, CircleAlert, X, LogOut } from 'lucide-react-native';
import { apiRequest } from './api';
import { AuthFlow } from './AuthFlow';
import { COLORS } from './config';
import { useSession } from './session';
import type { Book, Loan } from './types';

type Tab = 'home' | 'catalog' | 'activity' | 'account';
type Screen = 'login' | 'app';

function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.'; }
function dateText(value?: string) { return value ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa cập nhật'; }

function Button({ title, onPress, disabled, secondary, compact }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; compact?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, compact && styles.buttonCompact, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed]}><Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text></Pressable>;
}

function LoginScreen() {
  return <AuthFlow />;
}

function Header({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.headerTitle}>{title}</Text>{subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}</View>{action}</View>;
}

function BookCard({ book, onBorrow, librarian }: { book: Book; onBorrow?: (book: Book) => void; librarian?: boolean }) {
  return <View style={styles.bookCard}>
    <View style={styles.bookCover}>{book.coverImageUrl ? <Image source={{ uri: book.coverImageUrl }} style={styles.coverImage} /> : <BookOpen size={28} color={COLORS.green} />}</View>
    <View style={styles.bookInfo}><Text numberOfLines={2} style={styles.bookTitle}>{book.title}</Text><Text numberOfLines={1} style={styles.bookAuthor}>{book.author || book.authorNames?.join(', ') || book.authors?.join(', ') || 'Đang cập nhật tác giả'}</Text><View style={styles.bookMeta}><Text style={styles.category}>{book.categoryName || book.categoryNames?.[0] || 'Sách thư viện'}</Text><Text style={styles.available}>{book.availableCopies === undefined ? 'Xem chi tiết' : `${book.availableCopies} bản sẵn có`}</Text></View></View>
    {!librarian && onBorrow && <Pressable accessibilityLabel="Gửi yêu cầu mượn" onPress={() => onBorrow(book)} style={styles.bookAction}><ArrowUpRight size={19} color={COLORS.green} /></Pressable>}
  </View>;
}

function LoanCard({ loan }: { loan: Loan }) {
  const title = loan.bookTitle || loan.title || 'Phiếu mượn';
  const status = loan.displayStatus || loan.status || 'Đang xử lý';
  return <View style={styles.loanCard}><View style={styles.loanIcon}><BookMarked size={19} color={COLORS.green} /></View><View style={styles.loanCopy}><Text style={styles.loanTitle} numberOfLines={1}>{title}</Text><Text style={styles.loanMeta}>{loan.barcode ? `Mã ${loan.barcode} · ` : ''}{status}</Text></View><View style={styles.dueWrap}><Text style={styles.dueLabel}>HẠN TRẢ</Text><Text style={styles.dueDate}>{dateText(loan.dueDate)}</Text></View></View>;
}

function ReaderHome({ user, token, onBrowse, onBorrow, refreshKey }: { user: NonNullable<ReturnType<typeof useSession>['user']>; token: string; onBrowse: () => void; onBorrow: (book: Book) => void; refreshKey: number }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setBusy(true);
    try {
      const [catalog, myLoans] = await Promise.all([
        apiRequest<Book[]>('/api/v1/books?page=1&pageSize=4', {}, token),
        apiRequest<unknown>('/api/v1/me/circulation/loans?page=1&pageSize=3', {}, token),
      ]);
      setBooks(Array.isArray(catalog.data) ? catalog.data : []);
      const payload = myLoans.data as { items?: Loan[]; loans?: Loan[] } | Loan[] | undefined;
      setLoans(Array.isArray(payload) ? payload : payload?.items || payload?.loans || []);
    } catch (error) { Alert.alert('Không tải được dữ liệu', errorMessage(error)); }
    finally { setBusy(false); setRefreshing(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  return <ScrollView contentContainerStyle={styles.pageContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={COLORS.green} />}>
    <View style={styles.welcomeCard}><View style={styles.welcomeTop}><View><Text style={styles.welcomeEyebrow}>THỨC UỐNG CHO TÂM TRÍ</Text><Text style={styles.welcomeTitle}>Xin chào,{ '\n' }{user.fullName.split(' ').slice(-1)[0]} 👋</Text></View><View style={styles.welcomeOrb}><BookOpen size={27} color={COLORS.greenDark} /></View></View><Text style={styles.welcomeBody}>Hôm nay bạn muốn khám phá{ '\n' }điều gì mới?</Text><Pressable onPress={onBrowse} style={styles.discoverButton}><Text style={styles.discoverText}>Khám phá kho sách</Text><ArrowUpRight size={17} color="#fff" /></Pressable><View style={styles.welcomeLine} /></View>
    <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Đang mượn</Text><Text style={styles.sectionCaption}>Theo dõi những cuốn sách của bạn</Text></View><Pressable onPress={onBrowse}><Text style={styles.seeAll}>Xem tất cả</Text></Pressable></View>
    {busy ? <ActivityIndicator color={COLORS.green} style={{ marginVertical: 26 }} /> : loans.length ? loans.map((loan) => <LoanCard key={loan.id} loan={loan} />) : <View style={styles.emptyCard}><Clock3 size={21} color={COLORS.muted} /><Text style={styles.emptyText}>Bạn chưa có phiếu mượn nào.</Text></View>}
    <View style={[styles.sectionHeading, { marginTop: 25 }]}><View><Text style={styles.sectionTitle}>Gợi ý cho bạn</Text><Text style={styles.sectionCaption}>Một vài cuốn sách đáng khám phá</Text></View><Pressable onPress={onBrowse}><Text style={styles.seeAll}>Tất cả</Text></Pressable></View>
    {busy ? <ActivityIndicator color={COLORS.green} style={{ marginVertical: 26 }} /> : books.length ? books.map((book) => <BookCard key={book.id} book={book} onBorrow={onBorrow} />) : <View style={styles.emptyCard}><BookOpen size={21} color={COLORS.muted} /><Text style={styles.emptyText}>Chưa có sách để hiển thị.</Text></View>}
  </ScrollView>;
}

function CatalogScreen({ token, librarian, onBorrow }: { token: string; librarian: boolean; onBorrow?: (book: Book) => void }) {
  const [search, setSearch] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setBusy(true);
    try {
      const result = await apiRequest<unknown>(`/api/v1/books?page=1&pageSize=40${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`, {}, token);
      const payload = result.data as Book[] | { items?: Book[] } | undefined;
      setBooks(Array.isArray(payload) ? payload : payload?.items || []);
    } catch (error) { Alert.alert('Không tải được danh mục', errorMessage(error)); }
    finally { setBusy(false); setRefreshing(false); }
  }, [token, search]);
  useEffect(() => { const timer = setTimeout(() => void load(), 300); return () => clearTimeout(timer); }, [load]);
  return <View style={styles.flex}><Header title="Kho sách" subtitle={librarian ? 'Tra cứu và theo dõi đầu sách' : 'Tìm cuốn sách dành cho bạn'} /><View style={styles.searchBox}><Search size={18} color={COLORS.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Tìm tên sách, tác giả…" placeholderTextColor="#929e95" style={styles.searchInput} returnKeyType="search" /></View>
    {busy ? <ActivityIndicator color={COLORS.green} style={{ marginTop: 40 }} /> : <FlatList data={books} keyExtractor={(book) => book.id} renderItem={({ item }) => <BookCard book={item} onBorrow={librarian ? undefined : onBorrow} librarian={librarian} />} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={COLORS.green} />} ListEmptyComponent={<View style={styles.emptyCatalog}><BookOpen size={32} color={COLORS.muted} /><Text style={styles.emptyTitle}>Không tìm thấy sách</Text><Text style={styles.emptyText}>Thử một từ khóa khác nhé.</Text></View>} />}
  </View>;
}

function ActivityScreen({ token, role }: { token: string; role: 'Reader' | 'Librarian' }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const path = role === 'Reader' ? '/api/v1/me/circulation/loans?page=1&pageSize=30' : '/api/v1/circulation/loans?page=1&pageSize=30';
      const result = await apiRequest<unknown>(path, {}, token);
      const payload = result.data as { items?: Loan[]; loans?: Loan[] } | Loan[] | undefined;
      setLoans(Array.isArray(payload) ? payload : payload?.items || payload?.loans || []);
    } catch (error) { Alert.alert('Không tải được hoạt động', errorMessage(error)); }
    finally { setBusy(false); }
  }, [token, role]);
  useEffect(() => { void load(); }, [load]);
  return <View style={styles.flex}><Header title={role === 'Reader' ? 'Lịch sử mượn' : 'Phiếu mượn'} subtitle={role === 'Reader' ? 'Theo dõi trạng thái các yêu cầu của bạn' : 'Theo dõi các giao dịch thư viện'} />
    {busy ? <ActivityIndicator color={COLORS.green} style={{ marginTop: 40 }} /> : <FlatList data={loans} keyExtractor={(loan) => loan.id} renderItem={({ item }) => <LoanCard loan={item} />} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={COLORS.green} />} ListEmptyComponent={<View style={styles.emptyCatalog}><ClipboardList size={30} color={COLORS.muted} /><Text style={styles.emptyTitle}>Chưa có phiếu mượn</Text><Text style={styles.emptyText}>Các yêu cầu mượn sẽ xuất hiện tại đây.</Text></View>} />}
  </View>;
}

function AccountScreen({ user, onSignOut }: { user: NonNullable<ReturnType<typeof useSession>['user']>; onSignOut: () => Promise<void> }) {
  return <View style={styles.flex}><Header title="Tài khoản" subtitle="Thông tin hồ sơ thư viện" /><View style={styles.profileCard}><View style={styles.avatar}><Text style={styles.avatarText}>{user.fullName.split(' ').map((part) => part[0]).slice(-2).join('').toUpperCase()}</Text></View><Text style={styles.profileName}>{user.fullName}</Text><Text style={styles.profileEmail}>{user.email}</Text><View style={styles.profileDivider} /><View style={styles.profileRow}><Text style={styles.profileLabel}>Vai trò</Text><Text style={styles.profileValue}>{user.role === 'Librarian' ? 'Thủ thư' : 'Reader'}</Text></View><View style={styles.profileRow}><Text style={styles.profileLabel}>Trạng thái</Text><Text style={[styles.profileValue, { color: COLORS.green }]}>Đang hoạt động</Text></View><View style={{ width: '100%', marginTop: 15 }}><Pressable onPress={() => Alert.alert('Đăng xuất', 'Bạn có chắc muốn kết thúc phiên đăng nhập?', [{ text: 'Ở lại', style: 'cancel' }, { text: 'Đăng xuất', style: 'destructive', onPress: () => void onSignOut() }])} style={styles.logoutButton}><LogOut size={17} color={COLORS.red} /><Text style={styles.logoutText}>Đăng xuất</Text></Pressable></View></View></View>;
}

function BorrowModal({ book, onClose, token }: { book: Book | null; onClose: () => void; token: string }) {
  const [busy, setBusy] = useState(false);
  const [slots, setSlots] = useState<{ pickupAt: string; remainingCapacity: number }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  useEffect(() => {
    if (!book) return;
    let active = true;
    setLoadingSlots(true);
    setSelectedSlot(null);
    void apiRequest<{ pickupAt: string; remainingCapacity: number }[]>('/api/v1/me/circulation/pickup-slots', {}, token)
      .then((result) => {
        const available = Array.isArray(result.data) ? result.data : [];
        if (active) {
          setSlots(available);
          setSelectedSlot(available[0]?.pickupAt ?? null);
        }
      })
      .catch((error) => { if (active) { setSlots([]); Alert.alert('Không tải được khung giờ', errorMessage(error)); } })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [book, token]);
  if (!book) return null;
  const submit = async () => {
    setBusy(true);
    if (!selectedSlot) { Alert.alert('Chưa có khung giờ', 'Hiện chưa có khung giờ nhận sách còn chỗ. Thử lại sau.'); return; }
    try {
      await apiRequest('/api/v1/me/circulation/book-requests', { method: 'POST', body: JSON.stringify({ bookId: book.id, pickupAt: selectedSlot }) }, token);
      Alert.alert('Đã gửi yêu cầu', 'Thủ thư sẽ tiếp nhận yêu cầu mượn của bạn.');
      onClose();
    } catch (error) { Alert.alert('Chưa thể gửi yêu cầu', errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modalCard}><View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>YÊU CẦU MƯỢN</Text><Text style={styles.modalTitle}>Chọn thời gian nhận</Text></View><Pressable onPress={onClose} style={styles.modalClose}><X size={19} color={COLORS.ink} /></Pressable></View><View style={styles.modalBook}><BookOpen size={22} color={COLORS.green} /><Text numberOfLines={2} style={styles.modalBookTitle}>{book.title}</Text></View><Text style={styles.inputLabel}>KHUNG GIỜ CÒN CHỖ</Text>{loadingSlots ? <ActivityIndicator color={COLORS.green} style={{ marginVertical: 14 }} /> : slots.length ? <View style={styles.dateButtons}>{slots.slice(0, 4).map((slot) => <Pressable key={slot.pickupAt} onPress={() => setSelectedSlot(slot.pickupAt)} style={[styles.dateChoice, selectedSlot === slot.pickupAt && styles.dateChoiceActive]}><Text style={styles.dateChoiceText}>{new Date(slot.pickupAt).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {slot.remainingCapacity} chỗ</Text></Pressable>)}</View> : <Text style={styles.modalNote}>Hiện chưa có khung giờ nhận còn chỗ.</Text>}<Text style={styles.modalNote}>Yêu cầu sẽ được gửi đến thủ thư để xác nhận.</Text><Button title={busy ? 'Đang gửi…' : 'Gửi yêu cầu mượn'} onPress={() => void submit()} disabled={busy || loadingSlots || !selectedSlot} /></View></View></Modal>;
}

function ReaderApp({ user, token }: { user: NonNullable<ReturnType<typeof useSession>['user']>; token: string }) {
  const { signOut } = useSession();
  const [tab, setTab] = useState<Tab>('home');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const renderScreen = () => {
    if (tab === 'home') return <ReaderHome user={user} token={token} onBrowse={() => setTab('catalog')} onBorrow={setSelectedBook} refreshKey={refreshKey} />;
    if (tab === 'catalog') return <CatalogScreen token={token} librarian={false} onBorrow={setSelectedBook} />;
    if (tab === 'activity') return <ActivityScreen token={token} role="Reader" />;
    return <AccountScreen user={user} onSignOut={signOut} />;
  };
  return <View style={styles.appRoot}><View style={styles.appTop}><View style={styles.topBrand}><View style={styles.topLogo}><Image source={require('../assets/smartlibrary-logo.png')} style={{ width: 25, height: 25 }} resizeMode="contain" /></View><Text style={styles.topBrandName}>smartlibrary</Text></View><Pressable onPress={() => Alert.alert('Thông báo', 'Bạn đang xem các cập nhật mượn sách mới nhất.')} style={styles.notificationButton}><Bell size={19} color={COLORS.ink} /><View style={styles.notificationDot} /></Pressable></View><View style={styles.flex}>{renderScreen()}</View><BottomNav tab={tab} onChange={setTab} librarian={false} /><BorrowModal book={selectedBook} token={token} onClose={() => { setSelectedBook(null); setRefreshKey((key) => key + 1); }} /></View>;
}

function LibrarianHome({ user, token }: { user: NonNullable<ReturnType<typeof useSession>['user']>; token: string }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<{ borrowed?: number; overdue?: number; dueSoon?: number } | undefined>();
  const [barcode, setBarcode] = useState('');
  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setBusy(true);
    try {
      const [loanResult, statsResult, bookResult] = await Promise.all([
        apiRequest<unknown>('/api/v1/circulation/loans?page=1&pageSize=6', {}, token),
        apiRequest<{ borrowed?: number; overdue?: number; dueSoon?: number }>('/api/v1/circulation/stats', {}, token),
        apiRequest<Book[]>('/api/v1/books?page=1&pageSize=4', {}, token),
      ]);
      setStats(statsResult.data);
      const payload = loanResult.data as { items?: Loan[]; loans?: Loan[] } | Loan[] | undefined;
      setLoans(Array.isArray(payload) ? payload : payload?.items || payload?.loans || []);
      setBooks(Array.isArray(bookResult.data) ? bookResult.data : []);
    } catch (error) { Alert.alert('Không tải được dữ liệu', errorMessage(error)); }
    finally { setBusy(false); setRefreshing(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const lookup = async () => {
    if (!barcode.trim()) return;
    try {
      const result = await apiRequest<unknown>(`/api/v1/circulation/loans?search=${encodeURIComponent(barcode.trim())}&page=1&pageSize=1`, {}, token);
      const payload = result.data as Loan[] | { items?: Loan[] } | undefined;
      const found = Array.isArray(payload) ? payload[0] : payload?.items?.[0];
      if (found) Alert.alert('Đã tìm thấy phiếu', `${found.readerName || 'Độc giả'} · ${found.bookTitle || found.title || ''}\nTrạng thái: ${found.status || 'Đang xử lý'}`);
      else Alert.alert('Chưa tìm thấy', `Không tìm thấy phiếu phù hợp với “${barcode}”.`);
    } catch (error) { Alert.alert('Không thể tra cứu', errorMessage(error)); }
  };
  return <ScrollView contentContainerStyle={styles.pageContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={COLORS.green} />}>
    <View style={styles.librarianHero}><View><Text style={styles.welcomeEyebrow}>KHÔNG GIAN THỦ THƯ</Text><Text style={styles.librarianTitle}>Xin chào,{ '\n' }{user.fullName.split(' ').slice(-1)[0]}</Text><Text style={styles.librarianSubtitle}>Quản lý thư viện thật nhẹ nhàng.</Text></View><View style={styles.librarianIcon}><ClipboardList size={27} color="#fff" /></View></View>
    <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Tổng quan hôm nay</Text><Text style={styles.sectionCaption}>Tình hình hoạt động thư viện</Text></View></View>
    <View style={styles.statsRow}><View style={styles.statCard}><Text style={styles.statValue}>{busy ? '—' : stats?.borrowed ?? loans.length}</Text><Text style={styles.statLabel}>Đang mượn</Text><View style={styles.statIcon}><ClipboardList size={16} color={COLORS.green} /></View></View><View style={styles.statCard}><Text style={styles.statValue}>{busy ? '—' : stats?.overdue ?? 0}</Text><Text style={styles.statLabel}>Quá hạn</Text><View style={[styles.statIcon, { backgroundColor: '#fff1e4' }]}><CircleAlert size={16} color={COLORS.orange} /></View></View></View>
    <View style={styles.quickAction}><View style={styles.quickIcon}><Search size={19} color={COLORS.green} /></View><View style={styles.quickCopy}><Text style={styles.quickTitle}>Tra cứu mã vạch</Text><Text style={styles.quickSubtitle}>Tìm nhanh phiếu mượn trong hệ thống</Text></View></View>
    <View style={styles.barcodeRow}><TextInput value={barcode} onChangeText={setBarcode} placeholder="Nhập mã vạch hoặc mã phiếu" placeholderTextColor="#929e95" style={styles.barcodeInput} returnKeyType="search" onSubmitEditing={() => void lookup()} /><Button title="Tìm" compact onPress={() => void lookup()} /></View>
    <View style={[styles.sectionHeading, { marginTop: 27 }]}><View><Text style={styles.sectionTitle}>Phiếu mượn gần đây</Text><Text style={styles.sectionCaption}>Các giao dịch mới nhất</Text></View></View>
    {busy ? <ActivityIndicator color={COLORS.green} style={{ marginVertical: 26 }} /> : loans.length ? loans.map((loan) => <LoanCard key={loan.id} loan={loan} />) : <View style={styles.emptyCard}><ClipboardList size={21} color={COLORS.muted} /><Text style={styles.emptyText}>Chưa có giao dịch gần đây.</Text></View>}
  </ScrollView>;
}

function LibrarianScreen({ user, token }: { user: NonNullable<ReturnType<typeof useSession>['user']>; token: string }) {
  const { signOut } = useSession();
  const [tab, setTab] = useState<Tab>('home');
  const screen = useMemo(() => {
    if (tab === 'home') return <LibrarianHome user={user} token={token} />;
    if (tab === 'catalog') return <CatalogScreen token={token} librarian />;
    if (tab === 'activity') return <ActivityScreen token={token} role="Librarian" />;
    return <AccountScreen user={user} onSignOut={signOut} />;
  }, [tab, user, token]);
  return <View style={styles.appRoot}><View style={styles.appTop}><View style={styles.topBrand}><View style={styles.topLogo}><BookOpen size={18} color="#fff" /></View><Text style={styles.topBrandName}>smartlibrary</Text><View style={styles.staffBadge}><Text style={styles.staffBadgeText}>THỦ THƯ</Text></View></View><Pressable onPress={() => Alert.alert('Thông báo', 'Tính năng thông báo đang được kết nối với hệ thống.')} style={styles.notificationButton}><Bell size={19} color={COLORS.ink} /></Pressable></View><View style={styles.flex}>{screen}</View><BottomNav tab={tab} onChange={setTab} librarian /></View>;
}

function BottomNav({ tab, onChange, librarian }: { tab: Tab; onChange: (tab: Tab) => void; librarian: boolean }) {
  const items: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: 'Tổng quan', icon: Home }, { id: 'catalog', label: 'Kho sách', icon: BookOpen },
    { id: 'activity', label: librarian ? 'Phiếu mượn' : 'Lịch sử', icon: ClipboardList }, { id: 'account', label: 'Tài khoản', icon: CircleUserRound },
  ];
  return <SafeAreaView edges={['bottom']} style={styles.bottomNavSafe}><View style={styles.bottomNav}>{items.map((item) => { const Icon = item.icon; const active = item.id === tab; return <Pressable key={item.id} onPress={() => onChange(item.id)} style={styles.navItem}><Icon size={20} color={active ? COLORS.green : COLORS.muted} strokeWidth={active ? 2.4 : 1.8} /><Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>{active && <View style={styles.navActiveMark} />}</Pressable>; })}</View></SafeAreaView>;
}

export function SmartLibraryApp() {
  const { user, token, loading } = useSession();
  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={COLORS.green} size="large" /><Text style={styles.loadingText}>Đang mở thư viện…</Text></SafeAreaView>;
  if (!user || !token) return <LoginScreen />;
  return user.role === 'Librarian' ? <LibrarianScreen user={user} token={token} /> : <ReaderApp user={user} token={token} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, appRoot: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', gap: 13 }, loadingText: { color: COLORS.muted, fontSize: 14 },
  loginRoot: { flex: 1, backgroundColor: COLORS.background }, loginContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 20 },
  loginHero: { height: 300, borderRadius: 28, backgroundColor: COLORS.greenDark, padding: 27, justifyContent: 'flex-end', overflow: 'hidden' }, brandMark: { position: 'absolute', top: 25, left: 26, width: 53, height: 53, borderRadius: 18, backgroundColor: '#ffffff20', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#b8d9c3', fontSize: 10, letterSpacing: 2, fontWeight: '800', marginBottom: 13 }, loginTitle: { color: '#fff', fontSize: 37, lineHeight: 43, letterSpacing: -1.5, fontWeight: '700' }, loginSubtitle: { color: '#c4d8ca', fontSize: 13, lineHeight: 20, marginTop: 12 }, heroDecorA: { width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: '#ffffff18', position: 'absolute', top: -79, right: -54 }, heroDecorB: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#ffffff08', position: 'absolute', top: -8, right: -23 },
  loginForm: { paddingHorizontal: 6, paddingTop: 26 }, formHeading: { color: COLORS.ink, fontSize: 23, fontWeight: '700', letterSpacing: -0.5 }, formHint: { color: COLORS.muted, fontSize: 13, marginTop: 5, marginBottom: 22 }, inputLabel: { color: '#69766d', fontSize: 9, letterSpacing: 1.15, fontWeight: '800', marginBottom: 8 }, input: { height: 51, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingHorizontal: 15, color: COLORS.ink, fontSize: 14 }, passwordBox: { height: 51, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 }, passwordInput: { flex: 1, color: COLORS.ink, fontSize: 14 }, showPassword: { color: COLORS.green, fontWeight: '700', fontSize: 12 },
  button: { minHeight: 50, borderRadius: 14, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 20, marginTop: 20 }, buttonText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.15 }, buttonSecondary: { backgroundColor: COLORS.paleGreen }, buttonSecondaryText: { color: COLORS.greenDark }, buttonCompact: { minHeight: 42, marginTop: 0, borderRadius: 12, paddingHorizontal: 18 }, buttonDisabled: { opacity: 0.6 }, pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] }, roleNote: { textAlign: 'center', color: COLORS.muted, fontSize: 11, marginTop: 14 },
  appTop: { height: 63, backgroundColor: COLORS.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 21 }, topBrand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, topLogo: { width: 31, height: 31, borderRadius: 10, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' }, topBrandName: { color: COLORS.ink, fontWeight: '800', fontSize: 16, letterSpacing: -0.5 }, notificationButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' }, notificationDot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.orange, borderWidth: 1, borderColor: '#fff' }, staffBadge: { backgroundColor: COLORS.paleGreen, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, marginLeft: 2 }, staffBadgeText: { color: COLORS.green, fontSize: 8, letterSpacing: 0.6, fontWeight: '800' },
  pageContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 25 }, welcomeCard: { minHeight: 248, borderRadius: 24, padding: 23, backgroundColor: COLORS.greenDark, overflow: 'hidden', justifyContent: 'space-between' }, welcomeTop: { flexDirection: 'row', justifyContent: 'space-between' }, welcomeEyebrow: { color: '#b9d5c0', fontSize: 9, letterSpacing: 1.5, fontWeight: '800', marginBottom: 12 }, welcomeTitle: { color: '#fff', fontSize: 28, lineHeight: 34, letterSpacing: -0.7, fontWeight: '700' }, welcomeOrb: { marginTop: 6, width: 52, height: 52, borderRadius: 18, backgroundColor: '#deeddf', alignItems: 'center', justifyContent: 'center' }, welcomeBody: { color: '#c5d8ca', fontSize: 13, lineHeight: 20, marginTop: 14 }, discoverButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 11, backgroundColor: '#ffffff20', marginTop: 17 }, discoverText: { color: '#fff', fontSize: 12, fontWeight: '700' }, welcomeLine: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: '#ffffff13', right: -80, bottom: -95 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 13 }, sectionTitle: { color: COLORS.ink, fontSize: 17, letterSpacing: -0.35, fontWeight: '700' }, sectionCaption: { color: COLORS.muted, fontSize: 11, marginTop: 4 }, seeAll: { color: COLORS.green, fontSize: 11, fontWeight: '700' },
  loanCard: { minHeight: 75, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', marginBottom: 9 }, loanIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.paleGreen, alignItems: 'center', justifyContent: 'center', marginRight: 11 }, loanCopy: { flex: 1 }, loanTitle: { color: COLORS.ink, fontWeight: '700', fontSize: 12 }, loanMeta: { color: COLORS.muted, fontSize: 10, marginTop: 5 }, dueWrap: { alignItems: 'flex-end', marginLeft: 8 }, dueLabel: { color: '#8a968d', fontSize: 8, letterSpacing: 0.8, fontWeight: '800' }, dueDate: { color: COLORS.ink, fontSize: 10, fontWeight: '600', marginTop: 5 },
  bookCard: { minHeight: 91, backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 16, marginBottom: 10, padding: 11, flexDirection: 'row', alignItems: 'center' }, bookCover: { width: 56, height: 66, borderRadius: 10, backgroundColor: COLORS.paleGreen, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12 }, coverImage: { width: '100%', height: '100%' }, bookInfo: { flex: 1 }, bookTitle: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: COLORS.ink }, bookAuthor: { color: COLORS.muted, fontSize: 10, marginTop: 4 }, bookMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, category: { color: COLORS.green, backgroundColor: COLORS.paleGreen, fontSize: 8, fontWeight: '700', overflow: 'hidden', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 }, available: { color: COLORS.muted, fontSize: 9, marginLeft: 3 }, bookAction: { width: 31, height: 31, backgroundColor: '#f2f7f2', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 7 },
  emptyCard: { minHeight: 67, backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, emptyText: { color: COLORS.muted, fontSize: 11, lineHeight: 17 }, emptyCatalog: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 35 }, emptyTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '700', marginTop: 14, marginBottom: 5 },
  header: { paddingHorizontal: 21, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, headerCopy: { flex: 1 }, headerTitle: { color: COLORS.ink, fontSize: 25, letterSpacing: -0.7, fontWeight: '700' }, headerSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 5 }, searchBox: { height: 47, marginHorizontal: 20, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 }, searchInput: { flex: 1, color: COLORS.ink, fontSize: 12 }, listContent: { paddingHorizontal: 20, paddingBottom: 20, flexGrow: 1 },
  bottomNavSafe: { backgroundColor: COLORS.surface }, bottomNav: { height: 69, backgroundColor: COLORS.surface, borderTopWidth: 1, borderColor: COLORS.border, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 7 }, navItem: { minWidth: 71, alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative' }, navLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '600' }, navLabelActive: { color: COLORS.green, fontWeight: '800' }, navActiveMark: { width: 18, height: 2, borderRadius: 2, backgroundColor: COLORS.green, position: 'absolute', top: 0 },
  librarianHero: { minHeight: 177, borderRadius: 23, padding: 22, backgroundColor: COLORS.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, librarianTitle: { color: '#fff', fontWeight: '700', fontSize: 27, lineHeight: 33, letterSpacing: -0.7 }, librarianSubtitle: { color: '#d4e7d9', fontSize: 11, marginTop: 10 }, librarianIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#ffffff24', alignItems: 'center', justifyContent: 'center' }, statsRow: { flexDirection: 'row', gap: 11 }, statCard: { flex: 1, minHeight: 104, backgroundColor: COLORS.surface, borderRadius: 16, borderColor: COLORS.border, borderWidth: 1, padding: 15 }, statValue: { color: COLORS.ink, fontSize: 27, fontWeight: '700' }, statLabel: { color: COLORS.muted, fontSize: 10, marginTop: 5 }, statIcon: { position: 'absolute', top: 14, right: 13, width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.paleGreen, alignItems: 'center', justifyContent: 'center' }, quickAction: { flexDirection: 'row', alignItems: 'center', marginTop: 20 }, quickIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: COLORS.paleGreen, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, quickCopy: { flex: 1 }, quickTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '700' }, quickSubtitle: { color: COLORS.muted, fontSize: 10, marginTop: 4 }, barcodeRow: { flexDirection: 'row', gap: 8, marginTop: 11 }, barcodeInput: { height: 44, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingHorizontal: 12, color: COLORS.ink, fontSize: 11 },
  profileCard: { margin: 20, padding: 22, backgroundColor: COLORS.surface, borderRadius: 19, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' }, avatar: { width: 70, height: 70, borderRadius: 24, backgroundColor: COLORS.paleGreen, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: COLORS.green, fontWeight: '800', fontSize: 22 }, profileName: { color: COLORS.ink, fontWeight: '700', fontSize: 18, marginTop: 15 }, profileEmail: { color: COLORS.muted, fontSize: 12, marginTop: 5 }, profileDivider: { height: 1, backgroundColor: COLORS.border, width: '100%', marginVertical: 20 }, profileRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 9 }, profileLabel: { color: COLORS.muted, fontSize: 12 }, profileValue: { color: COLORS.ink, fontSize: 12, fontWeight: '700' }, logoutButton: { height: 47, borderRadius: 13, borderWidth: 1, borderColor: '#f0d7d4', backgroundColor: '#fff9f8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, logoutText: { color: COLORS.red, fontWeight: '700', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: '#17261d77', justifyContent: 'flex-end' }, modalCard: { backgroundColor: COLORS.background, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22, paddingBottom: Platform.OS === 'ios' ? 36 : 24 }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, modalEyebrow: { color: COLORS.green, fontSize: 9, letterSpacing: 1.3, fontWeight: '800', marginBottom: 6 }, modalTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '700' }, modalClose: { width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' }, modalBook: { minHeight: 56, borderRadius: 13, backgroundColor: COLORS.paleGreen, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 }, modalBookTitle: { color: COLORS.ink, fontWeight: '700', fontSize: 12, flex: 1 }, datePreview: { color: COLORS.ink, fontSize: 14, fontWeight: '700', marginBottom: 12, textTransform: 'capitalize' }, dateButtons: { flexDirection: 'row', gap: 8 }, dateChoice: { flex: 1, minHeight: 43, borderRadius: 11, borderColor: COLORS.border, borderWidth: 1, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' }, dateChoiceActive: { borderColor: COLORS.green, backgroundColor: COLORS.paleGreen }, dateChoiceText: { color: COLORS.ink, fontSize: 10, fontWeight: '600' }, modalNote: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 15 },
});
