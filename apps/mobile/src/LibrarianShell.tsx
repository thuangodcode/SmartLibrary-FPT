import React, { useEffect, useState } from 'react';
import { Alert, AppState, Image, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Boxes, ChevronLeft, CircleUserRound, ClipboardList, Home, RotateCcw, ScanLine } from 'lucide-react-native';
import { useSession } from './session';
import type { User } from './types';
import { CopyWorkflow } from './librarian/CopyWorkflow';
import { LoanWorkflow } from './librarian/LoanWorkflow';
import { IncidentWorkflow } from './librarian/IncidentWorkflow';
import { Scanner } from './librarian/Scanner';
import { conditionNames, dateOf, dateTimeOf, incidentNames, statusNames, useStaffData, type Incident, type CopySummary, type LoanPage, type StaffStats, type WarehouseCopy } from './librarian/data';
import { Action, BookIdentity, C, Info, LinkRow, Loading, Notice, Section, Title, u } from './librarian/ui';

type Workflow = { kind: 'copy'; id: string; returnLoanId?: string } | { kind: 'loan' | 'incident'; id: string };
type Tab = 'today' | 'loans' | 'scan' | 'account';
const nav = [{ id: 'today', label: 'Hôm nay', icon: Home }, { id: 'loans', label: 'Mượn trả', icon: ClipboardList }, { id: 'scan', label: 'Quét', icon: ScanLine }, { id: 'account', label: 'Tài khoản', icon: CircleUserRound }] as const;

export function LibrarianShell({ user, token }: { user: User; token: string }) {
  const [tab, setTab] = useState<Tab>('today');
  const [warehouse, setWarehouse] = useState(false);
  const [loanStatus, setLoanStatus] = useState('Active');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [incidents, setIncidents] = useState(false);
  const current = workflows[workflows.length - 1];
  const openCopy = (id: string, returnLoanId?: string) => setWorkflows(items => [...items, { kind: 'copy', id, returnLoanId }]);
  const openLoan = (id: string) => setWorkflows(items => [...items, { kind: 'loan', id }]);
  const openIncident = (id: string) => setWorkflows(items => [...items, { kind: 'incident', id }]);
  const closeWorkflow = () => setWorkflows(items => items.slice(0, -1));
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') setRevision(value => value + 1); });
    return () => listener.remove();
  }, []);
  const go = (next: Tab) => { setWarehouse(false); setIncidents(false); setTab(next); };
  const loans = (status: string) => { setLoanStatus(status); go('loans'); };
  return <SafeAreaView edges={['top', 'bottom']} style={s.root}>
    <StatusBar barStyle="dark-content" />
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Về Hôm nay" onPress={() => go('today')} style={u.row}><Image source={require('../assets/smartlibrary-logo.png')} style={s.logo} /><View><Text style={s.brand}>SmartLibrary</Text><Text style={s.scope}>Không gian thủ thư</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Làm mới dữ liệu" onPress={refresh} style={u.iconButton}><RotateCcw size={19} color={C.muted} /></Pressable></View>
    <View style={s.canvas}>
      {incidents ? <Incidents token={token} revision={revision} onOpen={openIncident} onBack={() => setIncidents(false)} /> : warehouse ? <Warehouse token={token} revision={revision} onOpen={openCopy} onBack={() => setWarehouse(false)} /> : tab === 'today' ? <Today token={token} revision={revision} onScan={() => go('scan')} onLoans={loans} onWarehouse={() => setWarehouse(true)} onIncidents={() => setIncidents(true)} /> : tab === 'loans' ? <Loans key={loanStatus} token={token} revision={revision} initialStatus={loanStatus} onOpen={openLoan} /> : tab === 'scan' ? <Scanner onCode={openCopy} paused={!!current} /> : <Account user={user} />}
    </View>
    <View style={s.nav}>{nav.map(item => { const Icon = item.icon; const selected = tab === item.id && !warehouse && !incidents; return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} onPress={() => go(item.id)} style={s.navItem}><View style={[s.navMark, selected && s.navMarkActive]}><Icon size={22} color={selected ? C.accent : C.muted} strokeWidth={selected ? 2 : 1.6} /></View><Text style={[s.navLabel, selected && { color: C.accent, fontWeight: '600' }]}>{item.label}</Text></Pressable>; })}</View>
    {current?.kind === 'copy' && <CopyWorkflow key={`copy-${workflows.length}-${current.id}`} code={current.id} returnLoanId={current.returnLoanId} token={token} onClose={closeWorkflow} onChanged={refresh} onLoan={openLoan} onIncident={openIncident} />}
    {current?.kind === 'loan' && <LoanWorkflow key={`loan-${workflows.length}-${current.id}`} id={current.id} token={token} onClose={closeWorkflow} onChanged={refresh} onCopy={openCopy} onIncident={openIncident} />}
    {current?.kind === 'incident' && <IncidentWorkflow key={`incident-${workflows.length}-${current.id}`} id={current.id} token={token} onClose={closeWorkflow} onChanged={refresh} onCopy={openCopy} onLoan={openLoan} />}
  </SafeAreaView>;
}

function Today({ token, revision, onScan, onLoans, onWarehouse, onIncidents }: { token: string; revision: number; onScan: () => void; onLoans: (status: string) => void; onWarehouse: () => void; onIncidents: () => void }) {
  const stats = useStaffData<StaffStats>('/api/v1/circulation/stats', token, revision);
  const copies = useStaffData<CopySummary>('/api/v1/copies/summary', token, revision);
  const refresh = () => { stats.reload(); copies.reload(); };
  return <ScrollView contentContainerStyle={u.page} refreshControl={<RefreshControl refreshing={stats.loading || copies.loading} onRefresh={refresh} tintColor={C.accent} />}>
    <Title title="Hôm nay" detail={new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: 'numeric', month: 'long' })} />
    <View style={s.scanPanel}><ScanLine size={30} color={C.accent} /><Text style={u.sectionTitle}>Bắt đầu từ một cuốn sách</Text><Text style={u.body}>Quét QR để xem đúng bản sao, nhận sách trả hoặc xếp sách lên kệ.</Text><Action title="Quét bản sao" onPress={onScan} /></View>
    <Section title="Công việc tại quầy">
      {stats.error && <Notice text={stats.error} error retry={stats.reload} />}
      <LinkRow title="Chờ duyệt" detail="Tiếp nhận hoặc từ chối yêu cầu" value={stats.data?.pending?.toString() ?? '—'} onPress={() => onLoans('Pending')} />
      <LinkRow title="Chờ giao sách" detail="Đối chiếu độc giả và quét bản sao" value={stats.data?.approved?.toString() ?? '—'} onPress={() => onLoans('Approved')} />
      <LinkRow title="Sự cố cần xác minh" detail="Đánh giá hư hỏng và xem hồ sơ" value={stats.data?.pendingIncidents?.toString() ?? '—'} onPress={onIncidents} />
      <LinkRow title="Đang mượn" detail="Tra cứu phiếu và xử lý trả sách" value={stats.data?.borrowed?.toLocaleString('vi-VN') ?? '—'} onPress={() => onLoans('Active')} />
      <LinkRow title="Quá hạn" detail="Kiểm tra hạn trả và phí tạm tính" value={stats.data?.overdue?.toLocaleString('vi-VN') ?? '—'} onPress={() => onLoans('Overdue')} />
      {copies.error && <Notice text={copies.error} error retry={copies.reload} />}
      <LinkRow title="Sách chờ xếp kệ" detail="Bản sao còn tốt đang trong kho" value={copies.data?.warehouseCopies?.toLocaleString('vi-VN') ?? '—'} onPress={onWarehouse} />
    </Section>
    <View style={s.cycle}><Text style={u.sectionTitle}>Từ quầy trở lại kệ</Text><Text style={u.body}>Nhận sách trả → kiểm tra tình trạng → đưa về kho → xác nhận xếp lên kệ.</Text></View>
  </ScrollView>;
}

function useSearch() {
  const [search, setSearch] = useState(''); const [query, setQuery] = useState('');
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 350); return () => clearTimeout(timer); }, [search]);
  return { search, setSearch, query };
}
function Loans({ token, revision, initialStatus, onOpen }: { token: string; revision: number; initialStatus: string; onOpen: (code: string) => void }) {
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const { search, setSearch, query } = useSearch();
  const path = `/api/v1/circulation/loans?page=${page}&pageSize=12&status=${encodeURIComponent(status)}&search=${encodeURIComponent(query)}`;
  const result = useStaffData<LoanPage>(path, token, revision);
  const changeSearch = (text: string) => { setSearch(text); setPage(1); };
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={u.page} refreshControl={<RefreshControl refreshing={result.loading} onRefresh={result.reload} tintColor={C.accent} />}>
    <Title title="Mượn trả" detail="Chọn phiếu để duyệt, giao sách, nhận trả hoặc xem kết quả." />
    <TextInput accessibilityLabel="Tìm phiếu mượn" value={search} onChangeText={changeSearch} placeholder="Tên sách, mã bản sao hoặc độc giả" placeholderTextColor={C.muted} style={u.input} returnKeyType="search" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{['Pending', 'Approved', 'Active', 'Overdue', 'Returned', 'Rejected'].map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: status === value }} onPress={() => { setStatus(value); setPage(1); }} style={[s.filter, status === value && s.filterSelected]}><Text style={[s.filterText, status === value && { color: C.ink, fontWeight: '600' }]}>{statusNames[value]}</Text></Pressable>)}</ScrollView>
    {result.loading ? <Loading /> : result.error ? <Notice text={result.error} error retry={result.reload} /> : <Section title={`${result.data?.totalCount ?? 0} phiếu ${statusNames[status].toLocaleLowerCase('vi')}`}>
      {!result.data?.items.length ? <Notice text="Chưa có phiếu phù hợp với điều kiện đang chọn." /> : result.data.items.map(loan => <Pressable key={loan.id} accessibilityRole="button" accessibilityLabel={`Xem phiếu ${loan.code}, ${loan.bookTitle}`} onPress={() => onOpen(loan.id)} style={({ pressed }) => [u.panel, pressed && u.pressed]}>
        <BookIdentity title={loan.bookTitle} code={loan.barcode} cover={loan.coverImageUrl} />
        <Text style={u.body}>{loan.readerName} · {loan.code}</Text><View style={u.row}><View style={u.grow}><Text style={[u.badgeText, { color: (loan.displayStatus || loan.status) === 'Overdue' ? C.red : C.muted }]}>{statusNames[loan.displayStatus || loan.status] || loan.status}</Text></View><Text style={u.body}>{status === 'Returned' ? `Đã trả ${dateOf(loan.returnDate)}` : ['Pending', 'Approved'].includes(loan.status) ? `Nhận ${dateTimeOf(loan.pickupAt)}` : `Hạn ${dateOf(loan.dueDate)}`}</Text></View>
        <Text style={s.textAction}>Mở chi tiết phiếu →</Text>
      </Pressable>)}
      <Pager page={page} pages={result.data?.totalPages ?? 0} onPage={setPage} />
    </Section>}
  </ScrollView>;
}

function Warehouse({ token, revision, onOpen, onBack }: { token: string; revision: number; onOpen: (code: string) => void; onBack: () => void }) {
  const [page, setPage] = useState(1); const { search, setSearch, query } = useSearch();
  const result = useStaffData<WarehouseCopy[]>(`/api/v1/copies?location=__warehouse__&page=${page}&pageSize=15&search=${encodeURIComponent(query)}`, token, revision);
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={u.page} refreshControl={<RefreshControl refreshing={result.loading} onRefresh={result.reload} tintColor={C.accent} />}>
    <Pressable accessibilityRole="button" onPress={onBack} style={[u.row, { minHeight: 44 }]}><ChevronLeft size={19} color={C.ink} /><Text style={u.itemTitle}>Hôm nay</Text></Pressable>
    <Title title="Sách chờ xếp kệ" detail="Chọn một bản sao trong kho để kiểm tra và xếp lên kệ." />
    <TextInput accessibilityLabel="Tìm sách trong kho" style={u.input} value={search} onChangeText={text => { setSearch(text); setPage(1); }} placeholder="Tên sách hoặc mã bản sao" placeholderTextColor={C.muted} />
    {result.loading ? <Loading /> : result.error ? <Notice text={result.error} error retry={result.reload} /> : !result.data?.length ? <Notice text="Không có bản sao chờ xếp phù hợp. Bạn có thể quét mã để tra cứu một cuốn cụ thể." /> : <View style={u.section}><Text style={u.body}>{Number(result.meta?.totalCount ?? result.data.length).toLocaleString('vi-VN')} bản sao phù hợp</Text>{result.data.map(copy => <Pressable key={copy.id} accessibilityRole="button" accessibilityLabel={`Xếp kệ ${copy.barcode}`} onPress={() => onOpen(copy.barcode)} style={({ pressed }) => [u.panel, pressed && u.pressed]}><Text style={u.itemTitle}>{copy.bookTitle}</Text><Text style={u.code}>{copy.barcode}</Text><View style={u.row}><Boxes size={17} color={C.muted} /><Text style={[u.body, u.grow]}>{conditionNames[copy.condition] || copy.condition} · Trong kho</Text><Text style={s.textAction}>Xếp kệ →</Text></View></Pressable>)}<Pager page={page} pages={Number(result.meta?.totalPages ?? 1)} onPage={setPage} /></View>}
  </ScrollView>;
}

function Incidents({ token, revision, onOpen, onBack }: { token: string; revision: number; onOpen: (id: string) => void; onBack: () => void }) {
  const [filter, setFilter] = useState('PendingReview');
  const result = useStaffData<Incident[]>('/api/v1/circulation/incidents', token, revision);
  const { search, setSearch, query } = useSearch();
  const rows = result.data?.filter(item => (filter === 'All' || item.status === filter) && `${item.barcode} ${item.bookTitle} ${item.readerName}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))) || [];
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={u.page} refreshControl={<RefreshControl refreshing={result.loading} onRefresh={result.reload} tintColor={C.accent} />}>
    <Pressable accessibilityRole="button" onPress={onBack} style={[u.row, { minHeight: 44 }]}><ChevronLeft size={19} color={C.ink} /><Text style={u.itemTitle}>Hôm nay</Text></Pressable>
    <Title title="Hồ sơ sự cố" detail="Xác minh tình trạng sách, trách nhiệm và bước xử lý tiếp theo." />
    <TextInput accessibilityLabel="Tìm hồ sơ sự cố" style={u.input} value={search} onChangeText={setSearch} placeholder="Mã bản sao, tên sách hoặc độc giả" placeholderTextColor={C.muted} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{['PendingReview', 'CompensationPending', 'Resolved', 'Rejected', 'All'].map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[s.filter, filter === value && s.filterSelected]}><Text style={s.filterText}>{incidentNames[value] || 'Tất cả'}</Text></Pressable>)}</ScrollView>
    {result.loading ? <Loading /> : result.error ? <Notice text={result.error} error retry={result.reload} /> : <Section title={`${rows.length} hồ sơ trong danh sách gần nhất`}>
      {!rows.length && <Notice text="Chưa có hồ sơ phù hợp với điều kiện đang chọn." />}
      {rows.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => onOpen(item.id)} style={u.panel}><Text style={u.itemTitle}>{item.bookTitle}</Text><Text style={u.code}>{item.barcode} · {item.readerName}</Text><Text style={u.body}>{incidentNames[item.status]} · {incidentNames[item.severity] || item.severity}</Text><Text style={u.body}>{item.description}</Text><Text style={s.textAction}>Xem hồ sơ →</Text></Pressable>)}
    </Section>}
  </ScrollView>;
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return <View style={u.row}><View style={u.grow}><Action title="Trước" secondary disabled={page <= 1} onPress={() => onPage(page - 1)} /></View><Text style={u.body}>{page}/{pages}</Text><View style={u.grow}><Action title="Sau" secondary disabled={page >= pages} onPress={() => onPage(page + 1)} /></View></View>;
}
function Account({ user }: { user: User }) {
  const { signOut } = useSession(); const [busy, setBusy] = useState(false);
  return <ScrollView contentContainerStyle={u.page}><Title title="Tài khoản" detail="Phiên làm việc của thủ thư" /><View style={u.panel}><Text style={u.sectionTitle}>{user.fullName}</Text><Text style={u.body}>{user.email}</Text><Info label="Vai trò" value="Thủ thư" /><Info label="Trạng thái tài khoản" value={user.status === 'Active' ? 'Đang hoạt động' : user.status} /></View><Action title="Đăng xuất" secondary busy={busy} onPress={() => Alert.alert('Kết thúc phiên làm việc?', 'Bạn có thể đăng nhập lại để tiếp tục xử lý sách.', [{ text: 'Ở lại', style: 'cancel' }, { text: 'Đăng xuất', style: 'destructive', onPress: () => { setBusy(true); void signOut().catch(() => { setBusy(false); Alert.alert('Chưa thể đăng xuất', 'Vui lòng thử lại.'); }); } }])} /></ScrollView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, header: { height: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, logo: { width: 34, height: 38, resizeMode: 'contain' }, brand: { fontSize: 19, fontWeight: '700', color: C.ink, letterSpacing: -0.4 }, scope: { fontSize: 12, lineHeight: 18, color: C.muted },
  canvas: { flex: 1, backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }, nav: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderColor: C.line, paddingHorizontal: 8, paddingTop: 4 }, navItem: { flex: 1, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 4 }, navMark: { paddingHorizontal: 12, paddingVertical: 5, borderTopWidth: 2, borderColor: 'transparent' }, navMarkActive: { borderColor: C.accent }, navLabel: { fontSize: 12, lineHeight: 18, color: C.muted },
  scanPanel: { backgroundColor: C.bg, borderRadius: 16, padding: 20, gap: 14 }, cycle: { gap: 8 }, filters: { gap: 8 }, filter: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: C.line, borderRadius: 8 }, filterSelected: { backgroundColor: C.bg, borderColor: '#8d96a3' }, filterText: { fontSize: 14, color: C.muted }, textAction: { color: C.accent, fontSize: 14, lineHeight: 21, fontWeight: '600' },
});
