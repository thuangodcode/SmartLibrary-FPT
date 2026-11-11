import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronLeft, X } from 'lucide-react-native';
import { ApiError, apiRequest } from '../api';
import { KeyboardScrollView } from '../KeyboardScrollView';
import { conditionNames, copyPlace, incidentNames, dateOf, dateTimeOf, messageOf, moneyOf, statusNames, useStaffData, type CopyHistory, type CopyLookup, type Shelf, type StaffLoan } from './data';
import { Action, BookIdentity, C, Info, Loading, Notice, Section, Title, u } from './ui';

type Stage = 'detail' | 'return' | 'shelves' | 'result';
interface Outcome { title: string; message: string; canShelve: boolean; incidentId?: string }

export function CopyWorkflow({ code, token, onClose, onChanged, onLoan, onIncident, returnLoanId }: { code: string; token: string; onClose: () => void; onChanged: () => void; onLoan: (id: string) => void; onIncident: (id: string) => void; returnLoanId?: string }) {
  const [copy, setCopy] = useState<CopyLookup>();
  const [stage, setStage] = useState<Stage>('detail');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [condition, setCondition] = useState('Good');
  const [notes, setNotes] = useState('');
  const history = useStaffData<CopyHistory>(copy ? `/api/v1/copies/${copy.id}/history` : '', token);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [outcome, setOutcome] = useState<Outcome>();
  const lock = useRef(false);
  const initialReturn = useRef(!!returnLoanId);
  const mounted = useRef(true);
  const requestId = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; }; }, []);
  const lookup = useCallback(async (next: Stage = 'detail') => {
    const current = ++requestId.current;
    setLoading(true); setError('');
    try {
      const response = await apiRequest<CopyLookup>(`/api/v1/copies/lookup?barcode=${encodeURIComponent(code.trim())}`, {}, token);
      if (!response.data) throw new Error('Máy chủ chưa trả về thông tin bản sao.');
      if (mounted.current && current === requestId.current) {
        setCopy(response.data);
        if (initialReturn.current && response.data.canReturn && response.data.openLoan?.id === returnLoanId) {
          setCondition(['New', 'Good', 'Fair', 'LightDamaged'].includes(response.data.condition) ? response.data.condition : 'Good');
          setStage('return'); initialReturn.current = false;
        } else setStage(next === 'shelves' && response.data.canShelve ? 'shelves' : 'detail');
      }
    } catch (error) { if (mounted.current && current === requestId.current) setError(messageOf(error)); }
    finally { if (mounted.current && current === requestId.current) setLoading(false); }
  }, [code, token, returnLoanId]);
  useEffect(() => { if (!lock.current) void lookup(); }, [lookup]);

  const mutate = async (kind: 'return' | 'shelve') => {
    if (!copy || lock.current || (kind === 'shelve' && !shelf)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (kind === 'return') {
        const response = await apiRequest<StaffLoan>('/api/v1/circulation/return', { method: 'POST', body: JSON.stringify({ barcode: copy.barcode, condition, notes: notes.trim(), loanId: returnLoanId || copy.openLoan?.id }) }, token);
        const loan = response.data;
        const detail = typeof response.meta?.message === 'string' ? response.meta.message : 'Đã ghi nhận trả sách.';
        if (mounted.current) setOutcome({ title: loan?.incidentOpened ? 'Đã lập hồ sơ sự cố' : 'Đã nhận lại sách', message: `${detail}${!loan?.incidentOpened && condition !== 'Damaged' && condition !== 'Lost' ? ' Bản sao đang ở kho, chờ xếp lên kệ.' : ''}`, canShelve: !loan?.incidentOpened && !['Damaged', 'Lost'].includes(condition), incidentId: loan?.incidentId });
      } else {
        await apiRequest('/api/v1/copies/locations/transfer', { method: 'POST', body: JSON.stringify({ assignments: [{ copyId: copy.id, location: shelf!.name }] }) }, token);
        if (mounted.current) setOutcome({ title: 'Đã xếp sách lên kệ', message: `${copy.barcode} đã được ghi nhận tại ${shelf!.name}. Vị trí đã cập nhật trên hệ thống.`, canShelve: false });
      }
      if (mounted.current) { setStage('result'); onChanged(); }
    } catch (error) {
      if (mounted.current) setError(error instanceof ApiError && error.status === 0
        ? 'Chưa xác định được kết quả vì mất kết nối. Hãy tải lại trạng thái trước khi thực hiện tiếp.' : messageOf(error));
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };

  const back = () => {
    if (busy) return;
    if (stage === 'return' || stage === 'shelves') { setStage('detail'); setError(''); setShelf(null); }
    else onClose();
  };
  const openReturn = () => { setNotes(''); setCondition(['New', 'Good', 'Fair', 'LightDamaged'].includes(copy?.condition || '') ? copy!.condition : 'Good'); setStage('return'); setError(''); };
  return <Modal visible animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal={false} onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.top}><Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={u.iconButton} onPress={back} disabled={busy}><ChevronLeft size={22} color={C.ink} /></Pressable><Text style={s.topTitle}>{stage === 'return' ? 'Kiểm tra trước khi trả' : stage === 'shelves' ? 'Xếp lên kệ' : 'Bản sao sách'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng bản sao" style={u.iconButton} onPress={onClose} disabled={busy}><X size={20} color={C.muted} /></Pressable></View>
      <KeyboardScrollView contentContainerStyle={u.page}>
        {loading ? <Loading text="Đang nhận diện bản sao…" /> : <>
          {copy && <BookIdentity title={copy.bookTitle} code={copy.barcode} cover={copy.coverImageUrl} />}
          {!!error && <Notice text={error} error retry={() => { setShelf(null); void lookup(); onChanged(); }} />}
          {copy && stage === 'detail' && <>
            <View style={u.panel}><Info label="Tình trạng sách" value={conditionNames[copy.condition] || copy.condition} /><Info label="Trạng thái" value={copy.openLoan ? statusNames[copy.openLoan.displayStatus || copy.openLoan.status] || 'Có phiếu đang mở' : !copy.isAvailable || ['Damaged', 'Lost'].includes(copy.condition) ? 'Cần xử lý' : copy.location ? 'Sẵn sàng trên kệ' : 'Trong kho, chờ xếp'} /><Info label="Vị trí đã ghi nhận" value={copyPlace(copy)} /></View>
            {copy.openLoan && <Section title="Phiếu liên quan"><LoanInformation loan={copy.openLoan} /><Action title="Mở chi tiết phiếu" secondary onPress={() => onLoan(copy.openLoan!.id)} /></Section>}
            {copy.canReturn ? <View style={u.section}><Action title="Xử lý trả sách" onPress={openReturn} /><Text style={u.body}>Kiểm tra cuốn sách thực tế và tình trạng khi nhận lại trước khi xác nhận.</Text></View> : copy.canShelve ? <View style={u.section}><Action title="Xếp lên kệ" onPress={() => { setShelf(null); setStage('shelves'); }} /><Text style={u.body}>Chọn kệ đích, đặt cuốn sách lên kệ rồi xác nhận vị trí.</Text></View> : <Notice text={copy.openLoan ? 'Bản sao đang gắn với một phiếu mượn. Không thể xếp lên kệ lúc này.' : copy.location ? 'Bản sao đã được ghi nhận trên kệ. Bạn có thể quét cuốn khác để tiếp tục công việc.' : 'Bản sao chưa đủ điều kiện xếp lên kệ. Mở hồ sơ sự cố bên dưới để xem và xử lý.'} />}
            <Section title="Sự cố và ghi chú bản sao">
              {history.loading ? <Loading text="Đang tải hồ sơ…" /> : history.error ? <Notice text={history.error} error retry={history.reload} /> : !history.data?.incidents.length ? <Text style={u.body}>Chưa ghi nhận sự cố cho bản sao này.</Text> : history.data.incidents.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => onIncident(item.id)} style={u.panel}><Text style={u.itemTitle}>{incidentNames[item.severity === 'Unknown' ? item.kind : item.severity] || item.kind} · {incidentNames[item.status] || item.status}</Text><Text style={u.body}>{dateOf(item.createdAt)} · {item.readerName}</Text><Text style={u.body}>{item.description || 'Mở hồ sơ để xem chi tiết.'}</Text><Text style={{ color: C.accent }}>Xem và xử lý hồ sơ →</Text></Pressable>)}
            </Section>
            <Section title="Lịch sử phiếu gần nhất">{history.data?.loans.map(loan => <Pressable key={loan.id} accessibilityRole="button" onPress={() => onLoan(loan.id)} style={u.panel}><Text style={u.itemTitle}>{loan.code} · {statusNames[loan.displayStatus || loan.status] || loan.status}</Text><Text style={u.body}>{loan.readerName} · {dateOf(loan.returnDate || loan.borrowDate || loan.pickupAt)}</Text>{loan.notes && <Text style={u.body}>{loan.notes}</Text>}</Pressable>)}</Section>
            <Action title="Làm mới trạng thái" onPress={() => { void lookup(); history.reload(); }} secondary />
          </>}
          {copy && stage === 'return' && <>
            {copy.openLoan && <LoanInformation loan={copy.openLoan} />}
            <Section title="Tình trạng khi nhận lại">{(copy.condition === 'LightDamaged' ? ['LightDamaged', 'Damaged', 'Lost'] : ['New', 'Good', 'Fair', 'Damaged', 'Lost']).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: condition === value }} onPress={() => setCondition(value)} disabled={busy} style={[s.choice, condition === value && s.choiceSelected]}><View style={u.grow}><Text style={u.itemTitle}>{conditionNames[value]}</Text>{value === 'Damaged' || value === 'Lost' ? <Text style={u.body}>Lập hồ sơ để xác minh, chưa tự tính bồi thường.</Text> : null}</View><View style={[s.radio, condition === value && s.radioSelected]}>{condition === value && <View style={s.radioDot} />}</View></Pressable>)}</Section>
            <Section title={['Damaged', 'Lost'].includes(condition) ? 'Mô tả tình trạng / lý do (bắt buộc)' : 'Ghi chú nhận trả'}><TextInput accessibilityLabel="Ghi chú nhận trả" multiline maxLength={2000} editable={!busy} value={notes} onChangeText={setNotes} style={[u.input, { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' }]} placeholder="Ví dụ: rách trang 15–18, bong gáy…" placeholderTextColor={C.muted} /></Section>
            {returnLoanId && copy.openLoan?.id !== returnLoanId && <Notice text="Phiếu đã thay đổi. Quay lại danh sách để tải lại đúng phiếu." error />}
            <Notice text={['Damaged', 'Lost'].includes(condition) ? 'Xác nhận này ghi nhận trả và mở hồ sơ mất/hỏng để thủ thư xác minh mức độ. Bản sao chưa thể xếp lên kệ.' : 'Sau khi xác nhận, phiếu được ghi nhận đã trả và bản sao về kho chờ xếp. Phí quá hạn, nếu có, được tính theo chính sách hệ thống.'} />
            <Action title={condition === 'Lost' ? 'Xác nhận ghi nhận thất lạc' : 'Xác nhận nhận lại sách'} onPress={() => void mutate('return')} busy={busy} disabled={!!error || (['Damaged', 'Lost'].includes(condition) && !notes.trim()) || (!!returnLoanId && copy.openLoan?.id !== returnLoanId)} />
            <Action title="Quay lại kiểm tra" onPress={back} secondary disabled={busy} />
          </>}
          {copy && stage === 'shelves' && <>
            <Title title="Đặt sách vào kệ nào?" detail="Vị trí chỉ được lưu sau khi bạn xác nhận đã xếp." />
            <ShelfPicker token={token} selected={shelf} onSelect={setShelf} disabled={busy} />
            {shelf && <Notice text={`Bạn sẽ ghi nhận ${copy.barcode} tại ${shelf.name}. Kệ hiện còn ${shelf.availableCapacity} chỗ theo lần tải gần nhất.`} />}
            <Action title={shelf ? 'Xác nhận đã xếp lên kệ' : 'Chọn kệ để tiếp tục'} onPress={() => void mutate('shelve')} disabled={!shelf || !!error} busy={busy} />
          </>}
          {stage === 'result' && outcome && <View style={u.section}>
            <View style={s.successMark}><Check size={30} color={C.green} /></View><Title title={outcome.title} detail={outcome.message} />
            {outcome.incidentId && <Action title="Tiếp tục xác minh sự cố" onPress={() => onIncident(outcome.incidentId!)} />}
            {outcome.canShelve && <Action title="Tiếp tục xếp lên kệ" onPress={() => void lookup('shelves')} />}
            <Action title="Xong, tiếp tục công việc" onPress={onClose} secondary />
          </View>}
        </>}
      </KeyboardScrollView>
    </SafeAreaView>
  </Modal>;
}

export function LoanInformation({ loan }: { loan: StaffLoan }) {
  return <View style={u.panel}><Info label="Mã phiếu" value={loan.code} /><Info label="Độc giả" value={loan.readerName} />{loan.readerEmail && <Info label="Email" value={loan.readerEmail} />}{loan.pickupAt && <Info label="Lịch nhận" value={dateTimeOf(loan.pickupAt)} />}{loan.studentId && <Info label="Mã độc giả" value={loan.studentId} />}<Info label="Trạng thái" value={statusNames[loan.displayStatus || loan.status] || loan.status} /><Info label="Hạn trả" value={dateOf(loan.dueDate)} danger={loan.displayStatus === 'Overdue' || loan.status === 'Overdue'} />{loan.suggestedFine != null && loan.suggestedFine > 0 && <Info label="Phí quá hạn tạm tính" value={moneyOf(loan.suggestedFine)} danger />}</View>;
}

function ShelfPicker({ token, selected, onSelect, disabled }: { token: string; selected: Shelf | null; onSelect: (shelf: Shelf) => void; disabled: boolean }) {
  const shelves = useStaffData<Shelf[]>('/api/v1/copies/locations', token);
  const [search, setSearch] = useState('');
  const filtered = shelves.data?.filter(item => item.name.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))) || [];
  return <View style={u.section}>
    <TextInput accessibilityLabel="Tìm tầng hoặc kệ" value={search} onChangeText={setSearch} style={u.input} placeholder="Tìm tầng hoặc tên kệ" placeholderTextColor={C.muted} />
    {shelves.loading ? <Loading text="Đang tải kệ và sức chứa…" /> : shelves.error ? <Notice text={shelves.error} error retry={shelves.reload} /> : !filtered.length ? <Notice text="Không có kệ phù hợp. Thử từ khóa khác hoặc kiểm tra danh sách kệ trên web." /> : <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 10 }}>{filtered.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selected?.id === item.id, disabled: item.availableCapacity <= 0 || disabled }} disabled={item.availableCapacity <= 0 || disabled} onPress={() => onSelect(item)} style={[s.choice, selected?.id === item.id && s.choiceSelected, item.availableCapacity <= 0 && { backgroundColor: C.bg }]}><View style={u.grow}><Text style={u.itemTitle}>{item.name}</Text><Text style={u.body}>{item.copyCount}/{item.capacity} chỗ · {item.availableCapacity > 0 ? `còn ${item.availableCapacity} chỗ` : 'Kệ đã đầy'}</Text></View>{selected?.id === item.id && <Check size={20} color={C.accent} />}</Pressable>)}</ScrollView>}
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.white }, top: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, borderBottomWidth: 1, borderColor: C.line }, topTitle: { fontSize: 16, fontWeight: '600', color: C.ink },
  choice: { minHeight: 70, flexDirection: 'row', gap: 16, alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 14 }, choiceSelected: { borderColor: C.accent, backgroundColor: C.soft }, radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#9ba4b0', alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: C.accent }, radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.accent }, successMark: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' },
});
