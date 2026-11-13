import React, { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react-native';
import { conditionNames, dateOf, dateTimeOf, incidentNames, statusNames, useStaffData, type Incident, type LoanPage, type StaffLoan, type WarehouseCopy } from './data';
import { Action, Badge, BookIdentity, C, Loading, Notice, SearchField, Title, u, type Tone } from './ui';

export function useSearch() {
  const [search, setSearch] = useState(''); const [query, setQuery] = useState('');
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 350); return () => clearTimeout(timer); }, [search]);
  return { search, setSearch, query };
}
export function loanTone(status: string): Tone {
  return status === 'Overdue' ? 'negative' : status === 'Returned' ? 'positive' : ['Pending', 'Approved'].includes(status) ? 'accent' : 'neutral';
}
export function LoanCard({ loan, onOpen }: { loan: StaffLoan; onOpen: (id: string) => void }) {
  const status = loan.displayStatus || loan.status;
  const action = loan.status === 'Pending' ? 'Tiếp nhận' : loan.status === 'Approved' ? 'Đối chiếu giao' : ['Borrowed', 'Overdue'].includes(loan.status) ? 'Nhận trả' : 'Xem kết quả';
  const time = loan.status === 'Returned' ? `Đã trả ${dateTimeOf(loan.returnDate)}` : ['Pending', 'Approved'].includes(loan.status) ? `Lịch nhận ${dateTimeOf(loan.pickupAt)}` : loan.dueDate ? `Hạn ${dateOf(loan.dueDate)}` : 'Chưa có hạn trả';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${action}: ${loan.bookTitle}, ${loan.barcode}, ${loan.readerName}, ${statusNames[status] || status}`} onPress={() => onOpen(loan.id)} style={({ pressed }) => [u.panel, pressed && u.pressed]}>
    <BookIdentity title={loan.bookTitle} code={loan.barcode} cover={loan.coverImageUrl} />
    <View style={u.row}><Text style={[u.itemTitle, u.grow, { fontSize: 14 }]} numberOfLines={1}>{loan.readerName}</Text><Text style={styles.meta}>{loan.code}</Text></View>
    <View style={u.row}><Clock3 size={15} color={status === 'Overdue' ? C.red : C.muted} /><Text style={[u.body, u.grow, status === 'Overdue' && { color: C.red }]}>{time}{status === 'Overdue' && loan.overdueDays ? ` · trễ ${loan.overdueDays} ngày` : ''}</Text></View>
    <View style={styles.cardFoot}><Badge label={statusNames[status] || status} tone={loanTone(status)} /><View style={[u.row, { gap: 6 }]}><Text style={styles.action}>{action}</Text><ArrowRight size={16} color={C.accent} /></View></View>
  </Pressable>;
}

export function FilterStrip({ values, selected, onSelect }: { values: { id: string; label: string }[]; selected: string; onSelect: (value: string) => void }) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Record<string, number>>({});
  const reveal = () => scroll.current?.scrollTo({ x: Math.max(0, (positions.current[selected] || 0) - 24), animated: false });
  useEffect(() => { scroll.current?.scrollTo({ x: Math.max(0, (positions.current[selected] || 0) - 24), animated: true }); }, [selected]);
  return <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" onContentSizeChange={reveal} contentContainerStyle={styles.filters}>{values.map(value => <Pressable key={value.id} accessibilityRole="tab" accessibilityState={{ selected: selected === value.id }} onLayout={event => { positions.current[value.id] = event.nativeEvent.layout.x; if (value.id === selected) reveal(); }} onPress={() => onSelect(value.id)} style={[styles.filter, selected === value.id && styles.filterSelected]}><Text style={[styles.filterText, selected === value.id && styles.filterTextSelected]}>{value.label}</Text></Pressable>)}</ScrollView>;
}

export function Loans({ token, revision, route, onOpen }: { token: string; revision: number; route: { status: string; key: number }; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState(route.status); const [page, setPage] = useState(1);
  const { search, setSearch, query } = useSearch();
  useEffect(() => { setStatus(route.status); setPage(1); setSearch(''); }, [route, setSearch]);
  const result = useStaffData<LoanPage>(`/api/v1/circulation/loans?page=${page}&pageSize=12&status=${encodeURIComponent(status)}&search=${encodeURIComponent(query)}`, token, revision);
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={u.page} refreshControl={<RefreshControl refreshing={result.loading} onRefresh={result.reload} tintColor={C.accent} />}>
    <Title title="Mượn trả" detail="Từ tiếp nhận yêu cầu đến nhận lại từng cuốn sách." />
    <View style={u.section}><SearchField label="Tìm phiếu mượn" value={search} onChangeText={text => { setSearch(text); setPage(1); }} placeholder="Sách, mã bản sao hoặc độc giả" /><FilterStrip values={['Pending', 'Approved', 'Active', 'Overdue', 'Returned', 'Rejected', 'All'].map(id => ({ id, label: statusNames[id] || 'Tất cả' }))} selected={status} onSelect={value => { setStatus(value); setPage(1); }} /></View>
    {result.error && <Notice text={result.error} error retry={result.reload} />}
    {result.loading && !result.data ? <Loading /> : result.data && <View style={u.section}>
      <View style={u.row}><Text style={[u.sectionTitle, u.grow]}>{statusNames[status] || 'Tất cả phiếu'}</Text><Text style={styles.meta}>{result.data.totalCount.toLocaleString('vi-VN')} phiếu</Text></View>
      {!result.data.items.length ? <Notice text={query ? 'Không tìm thấy phiếu phù hợp. Thử tên sách, mã bản sao hoặc tên độc giả khác.' : 'Chưa có phiếu ở nhóm này. Các phiếu mới sẽ xuất hiện tại đây.'} /> : result.data.items.map(loan => <LoanCard key={loan.id} loan={loan} onOpen={onOpen} />)}
      <Pager page={page} pages={result.data.totalPages} onPage={setPage} />
    </View>}
  </ScrollView>;
}

export function Warehouse({ token, revision, onOpen, onBack }: { token: string; revision: number; onOpen: (code: string) => void; onBack: () => void }) {
  const [page, setPage] = useState(1); const { search, setSearch, query } = useSearch();
  const result = useStaffData<WarehouseCopy[]>(`/api/v1/copies?location=__warehouse__&page=${page}&pageSize=15&search=${encodeURIComponent(query)}`, token, revision);
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={u.page} refreshControl={<RefreshControl refreshing={result.loading} onRefresh={result.reload} tintColor={C.accent} />}>
    <Pressable accessibilityRole="button" onPress={onBack} style={[u.row, { minHeight: 44 }]}><ChevronLeft size={19} color={C.ink} /><Text style={u.itemTitle}>Hôm nay</Text></Pressable>
    <Title title="Sách chờ xếp kệ" detail="Các bản sao trong kho còn đủ điều kiện sử dụng, gồm cả hư nhẹ đã xác minh." />
    <SearchField label="Tìm sách trong kho" value={search} onChangeText={text => { setSearch(text); setPage(1); }} placeholder="Tên sách hoặc mã bản sao" />
    {result.error && <Notice text={result.error} error retry={result.reload} />}
    {result.loading && !result.data ? <Loading /> : result.data && <View style={u.section}><Text style={u.body}>{Number(result.meta?.totalCount ?? result.data.length).toLocaleString('vi-VN')} bản sao đủ điều kiện</Text>
      {!result.data.length && <Notice text="Không có bản sao chờ xếp phù hợp. Bạn vẫn có thể dùng Quét để tra cứu một cuốn cụ thể." />}
      {result.data.map(copy => <Pressable key={copy.id} accessibilityRole="button" accessibilityLabel={`Kiểm tra và xếp kệ ${copy.barcode}`} onPress={() => onOpen(copy.barcode)} style={({ pressed }) => [u.panel, pressed && u.pressed]}><BookIdentity title={copy.bookTitle} code={copy.barcode} cover={copy.coverImageUrl} /><Badge label={conditionNames[copy.condition] || copy.condition} tone={copy.condition === 'LightDamaged' ? 'warning' : 'positive'} /><View style={styles.cardFoot}><Text style={u.body}>Trong kho · chưa có kệ</Text><Text style={styles.action}>Chọn kệ →</Text></View></Pressable>)}
      <Pager page={page} pages={Number(result.meta?.totalPages ?? 1)} onPage={setPage} />
    </View>}
  </ScrollView>;
}

const incidentFilters = [{ id: 'PendingReview', label: 'Chờ xác minh' }, { id: 'CompensationPending', label: 'Chờ thanh toán' }, { id: 'Resolved', label: 'Đã xử lý' }, { id: 'Rejected', label: 'Đã từ chối' }, { id: 'All', label: 'Tất cả' }];
export function Incidents({ token, revision, routeKey, onOpen }: { token: string; revision: number; routeKey: number; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState('PendingReview');
  const result = useStaffData<Incident[]>('/api/v1/circulation/incidents', token, revision);
  const { search, setSearch, query } = useSearch();
  useEffect(() => { setFilter('PendingReview'); setSearch(''); }, [routeKey, setSearch]);
  const rows = result.data?.filter(item => (filter === 'All' || item.status === filter) && `${item.barcode} ${item.bookTitle} ${item.readerName}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))) || [];
  return <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={u.page} refreshControl={<RefreshControl refreshing={result.loading} onRefresh={result.reload} tintColor={C.accent} />}>
    <Title title="Sự cố" detail="Kiểm tra cuốn sách, xác minh và theo dõi bồi thường." />
    <View style={u.section}><SearchField label="Tìm hồ sơ sự cố" value={search} onChangeText={setSearch} placeholder="Mã bản sao, sách hoặc độc giả" /><FilterStrip values={incidentFilters} selected={filter} onSelect={setFilter} /></View>
    {result.error && <Notice text={result.error} error retry={result.reload} />}
    {result.loading && !result.data ? <Loading /> : result.data && <View style={u.section}>
      <View style={u.row}><Text style={[u.sectionTitle, u.grow]}>{incidentFilters.find(item => item.id === filter)?.label}</Text><Text style={styles.meta}>{rows.length} hồ sơ phù hợp</Text></View>
      <Text style={styles.meta}>50 hồ sơ gần nhất</Text>
      {!rows.length && <Notice text={query ? 'Chưa tìm thấy hồ sơ trong danh sách gần nhất. Thử mã bản sao chính xác hoặc dùng Quét để xem lịch sử cuốn sách.' : 'Không có hồ sơ trong nhóm này ở danh sách gần nhất.'} />}
      {rows.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Hồ sơ ${item.barcode}, ${item.bookTitle}, ${incidentNames[item.status]}`} onPress={() => onOpen(item.id)} style={({ pressed }) => [u.panel, pressed && u.pressed]}>
        <View style={u.row}><Text style={[u.itemTitle, u.grow]}>{item.bookTitle}</Text><ChevronRight size={18} color={C.muted} /></View>
        <Text style={u.code}>{item.barcode} · {item.readerName}</Text>
        <View style={[u.row, { flexWrap: 'wrap', gap: 8 }]}><Badge label={incidentFilters.find(value => value.id === item.status)?.label || item.status} tone={item.status === 'PendingReview' ? 'accent' : item.status === 'CompensationPending' ? 'warning' : 'neutral'} /><Badge label={item.severity === 'Unknown' ? 'Chưa xác minh mức độ' : incidentNames[item.severity] || item.severity} tone={item.severity === 'Severe' || item.severity === 'Lost' ? 'negative' : 'neutral'} /></View>
        {!!item.description && <Text numberOfLines={2} style={u.body}>{item.description}</Text>}
        <View style={styles.cardFoot}><Text style={styles.meta}>{dateOf(item.createdAt)}</Text><Text style={styles.action}>{item.status === 'PendingReview' ? 'Kiểm tra hồ sơ' : 'Xem kết quả'} →</Text></View>
      </Pressable>)}
    </View>}
  </ScrollView>;
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return <View style={u.row}><View style={u.grow}><Action title="Trước" secondary disabled={page <= 1} onPress={() => onPage(page - 1)} /></View><Text style={u.body}>{page}/{pages}</Text><View style={u.grow}><Action title="Sau" secondary disabled={page >= pages} onPress={() => onPage(page + 1)} /></View></View>;
}
const styles = StyleSheet.create({
  filters: { gap: 8, paddingVertical: 2 }, filter: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line }, filterSelected: { backgroundColor: C.ink, borderColor: C.ink }, filterText: { fontSize: 14, fontWeight: '500', color: C.muted }, filterTextSelected: { color: C.white },
  meta: { fontSize: 12, lineHeight: 18, color: C.muted, flexShrink: 1 }, cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 10, borderTopWidth: 1, borderColor: C.line }, action: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: C.accent },
});
