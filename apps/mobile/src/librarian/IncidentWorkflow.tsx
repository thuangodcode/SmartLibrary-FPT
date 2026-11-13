import React, { useRef, useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { apiRequest } from '../api';
import { conditionNames, dateOf, incidentNames, statusNames, messageOf, moneyOf, useStaffData, type Incident, type StaffStats } from './data';
import { Action, Badge, BookIdentity, C, Disclosure, Info, Loading, Notice, Section, u } from './ui';
import { WorkSheet } from './WorkSheet';
import { successFeedback } from './feedback';

export function IncidentWorkflow({ id, token, onClose, onChanged, onLoan, onCopy }: { id: string; token: string; onClose: () => void; onChanged: () => void; onLoan: (id: string) => void; onCopy: (code: string) => void }) {
  const item = useStaffData<Incident>(`/api/v1/circulation/incidents/${id}`, token);
  const stats = useStaffData<StaffStats>('/api/v1/circulation/stats', token);
  const [severity, setSeverity] = useState(''); const [notes, setNotes] = useState('');
  const [overdue, setOverdue] = useState(true); const [restore, setRestore] = useState(false); const [condition, setCondition] = useState('Fair');
  const [mode, setMode] = useState<'detail' | 'reject' | 'restore'>('detail');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const data = item.data; const actualSeverity = data?.kind === 'Lost' ? 'Lost' : severity;
  const fee = actualSeverity === 'Light' ? stats.data?.damageFee || 0 : ['Severe', 'Lost'].includes(actualSeverity) ? stats.data?.lostFee || 0 : 0;
  const total = fee + (overdue ? data?.suggestedOverdueFine || 0 : 0);
  const mutate = async (action: string, body: object) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await apiRequest(`/api/v1/circulation/incidents/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) }, token);
      setMessage(typeof response.meta?.message === 'string' ? response.meta.message : 'Đã lưu kết quả xử lý.');
      setMode('detail'); setNotes(''); successFeedback(); item.reload(); onChanged();
    } catch (reason) { setError(messageOf(reason)); }
    finally { lock.current = false; setBusy(false); }
  };
  const confirm = (action: string, detail: string, body: object) => Alert.alert('Xác nhận kết quả xử lý?', detail, [{ text: 'Kiểm tra lại', style: 'cancel' }, { text: 'Xác nhận', onPress: () => void mutate(action, body) }]);
  const notesInput = <View style={{ gap: 8 }}><Text style={u.itemTitle}>Kết luận kiểm tra (bắt buộc)</Text><TextInput accessibilityLabel="Kết luận xác minh" multiline editable={!busy} maxLength={2000} style={[u.input, { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} placeholder="Mô tả đã kiểm tra gì và kết luận…" placeholderTextColor={C.muted} /><Text style={[u.body, { fontSize: 12, textAlign: 'right' }]}>{notes.length}/2.000 ký tự</Text></View>;
  const conditionPicker = <Section title="Tình trạng sau khi kiểm tra">{['Good', 'Fair', 'LightDamaged'].map(value => <Choice key={value} label={conditionNames[value]} selected={condition === value} disabled={busy || item.loading} onPress={() => setCondition(value)} />)}</Section>;
  const footer = data ? mode === 'restore' ? <Action title="Xác nhận đủ điều kiện sử dụng" busy={busy} disabled={!notes.trim() || item.loading} onPress={() => confirm('restore-copy', `${conditionNames[condition]}\n${notes.trim()}\nBản sao về kho chờ xếp kệ.`, { condition, notes: notes.trim() })} />
    : mode === 'reject' ? <Action title="Xác nhận từ chối hồ sơ" busy={busy} disabled={!notes.trim() || item.loading} onPress={() => confirm('reject', `${notes.trim()}\n${restore ? `Bản sao: ${conditionNames[condition]}, về kho chờ xếp.` : 'Giữ nguyên tình trạng bản sao.'}`, { notes: notes.trim(), restoreCopy: restore, ...(restore ? { condition } : {}) })} />
    : data.status === 'PendingReview' ? data.loanStatus !== 'Returned' ? <Action title="Mở phiếu để nhận trả / báo mất" disabled={busy || item.loading} onPress={() => onLoan(data.borrowRecordId)} /> : <Action title="Xác nhận mức độ và lập phí" busy={busy} disabled={!notes.trim() || fee <= 0 || stats.loading || !!stats.error || item.loading} onPress={() => confirm('confirm', `${incidentNames[actualSeverity]} · ${moneyOf(total)}\n${notes.trim()}`, { severity: actualSeverity, applyOverdue: overdue, notes: notes.trim() })} />
    : data.canRestoreCopy ? <Action title="Kiểm tra phục hồi bản sao" disabled={busy || item.loading} onPress={() => { setNotes(''); setMode('restore'); }} /> : undefined : undefined;
  return <WorkSheet title={mode === 'restore' ? 'Kiểm tra phục hồi sách' : mode === 'reject' ? 'Từ chối trách nhiệm' : 'Hồ sơ sự cố'} busy={busy} onClose={onClose} onBack={mode !== 'detail' ? () => { setMode('detail'); setError(''); } : undefined} footer={footer}>
    {item.loading && !data ? <Loading /> : !data && item.error ? <Notice text={item.error} error retry={item.reload} /> : data && <>
      <BookIdentity title={data.bookTitle} code={data.barcode} />
      <View style={u.panel}><Badge label={data.status === 'Resolved' ? 'Đã xử lý' : incidentNames[data.status] || data.status} tone={data.status === 'PendingReview' ? 'accent' : data.status === 'CompensationPending' ? 'warning' : 'neutral'} /><Info label="Độc giả" value={data.readerName} />{mode === 'detail' && <><Info label="Phiếu mượn" value={statusNames[data.loanStatus] || data.loanStatus} /><Info label="Mức độ đã xác minh" value={data.severity === 'Unknown' ? 'Chưa xác minh mức độ' : incidentNames[data.severity] || data.severity} /></>}<Info label="Bản sao hiện tại" value={conditionNames[data.copyCondition] || data.copyCondition} />{mode === 'detail' && <Info label="Ngày ghi nhận" value={dateOf(data.createdAt)} />}</View>
      {mode === 'detail' && data.description && <Disclosure title="Ghi nhận và kết quả kiểm tra" initiallyOpen={data.status === 'PendingReview'}><Text selectable style={[u.body, { color: C.ink }]}>{data.description}</Text></Disclosure>}
      {item.error && <Notice text={item.error} error retry={item.reload} />}{!!error && <Notice text={error} error retry={item.reload} />}{!!message && <Notice text={message} success />}
      {mode === 'restore' ? <Section title="Đã sửa hoặc tìm thấy sách">
        <Notice text="Chỉ xác nhận sau khi kiểm tra sách thực tế. Bản sao sẽ về kho chờ xếp; các khoản phí và lịch sử vẫn được giữ nguyên." />
        {conditionPicker}{notesInput}
        <Action title="Quay lại hồ sơ" secondary disabled={busy || item.loading} onPress={() => setMode('detail')} />
      </Section> : mode === 'reject' ? <Section title="Từ chối trách nhiệm sự cố">
        <Notice text="Từ chối hồ sơ không tự đổi sách thành tốt. Nếu sách đã được trả/tìm thấy và còn sử dụng được, hãy xác nhận riêng bên dưới. Phí quá hạn, nếu có, vẫn được xử lý theo chính sách." />
        {data.loanStatus === 'Returned' && <View style={u.row}><Text style={[u.body, u.grow]}>Đã kiểm tra, sách đủ điều kiện sử dụng</Text><Switch accessibilityLabel="Cho bản sao sử dụng lại" value={restore} onValueChange={setRestore} disabled={busy || item.loading} trackColor={{ true: C.accent }} /></View>}
        {restore && conditionPicker}{notesInput}
        <Action title="Quay lại xác minh" secondary disabled={busy || item.loading} onPress={() => setMode('detail')} />
      </Section> : <>
        {data.status === 'PendingReview' ? <>
          {data.loanStatus !== 'Returned' ? <Notice text="Độc giả đã báo sự cố nhưng phiếu chưa kết thúc. Ghi nhận nhận trả hoặc thất lạc trên phiếu trước khi xác nhận mức độ và phí." /> : <Section title="Xác minh mức độ">
            {data.kind === 'Lost' ? <Info label="Loại xác nhận" value="Thất lạc" /> : <><Choice label="Hư nhẹ — vẫn cho phép xếp kệ" selected={severity === 'Light'} disabled={busy || item.loading} onPress={() => setSeverity('Light')} /><Choice label="Hư nặng — giữ kho, chặn xếp kệ" selected={severity === 'Severe'} disabled={busy || item.loading} onPress={() => setSeverity('Severe')} /></>}
            {stats.loading ? <Loading text="Đang tải chính sách phí…" /> : stats.error ? <Notice text={stats.error} error retry={stats.reload} /> : <Info label="Bồi thường cố định theo chính sách" value={!actualSeverity ? 'Chọn mức độ trước' : fee > 0 ? moneyOf(fee) : 'Chưa cấu hình'} />}
            {data.hasRecordedOverdueFine && <Notice text="Phí quá hạn đã có trên phiếu. Không lập thêm; xem và thanh toán khoản cũ trong chi tiết phiếu." />}
            {(data.suggestedOverdueFine || 0) > 0 && <View style={u.row}><Text style={[u.body, u.grow]}>Cộng quá hạn {moneyOf(data.suggestedOverdueFine!)}</Text><Switch accessibilityLabel="Cộng phí quá hạn" value={overdue} onValueChange={setOverdue} disabled={busy || item.loading} trackColor={{ true: C.accent }} /></View>}
            <View style={[u.panel, { backgroundColor: C.soft, borderColor: C.soft }]}><Info label="Tổng phí sẽ lập" value={actualSeverity ? moneyOf(total) : 'Chưa xác định'} /><Text style={u.body}>Chỉ lập sau khi bạn xác nhận kết luận. Khoản đã lập trước đó không được cộng lại.</Text></View>
            <Notice text={!actualSeverity ? 'Chọn mức độ theo kết quả kiểm tra sách thực tế trước khi xác nhận.' : actualSeverity === 'Light' ? 'Sau xác minh: hư nhẹ, còn sử dụng được, có thể xếp kệ ngay. Không cần chờ độc giả đóng phạt.' : actualSeverity === 'Lost' ? 'Sau xác minh: thất lạc, không được xếp kệ. Thanh toán không tự khôi phục sách.' : 'Sau xác minh: hư nặng, giữ trong kho và không được xếp kệ. Đóng phạt không tự đổi tình trạng sách.'} />
            {notesInput}
          </Section>}
          <Action title="Từ chối hồ sơ / tìm thấy sách" secondary disabled={busy || item.loading} onPress={() => { setRestore(false); setNotes(''); setMode('reject'); }} />
        </> : <><Info label="Tổng phí đã lập" value={moneyOf(data.totalAmount)} /><Notice text={data.copyCondition === 'LightDamaged' ? 'Bản sao hư nhẹ vẫn được xếp kệ và cho mượn, độc lập với việc thanh toán phí.' : ['Damaged', 'Lost'].includes(data.copyCondition) ? 'Bản sao chưa đủ điều kiện sử dụng. Thanh toán không tự cho phép xếp kệ.' : 'Tình trạng bản sao và trách nhiệm thanh toán được theo dõi riêng.'} />
        </>}
        <Action title="Xem phiếu và phí liên quan" secondary disabled={busy || item.loading} onPress={() => onLoan(data.borrowRecordId)} />
        <Action title="Xem tình trạng và vị trí bản sao" secondary disabled={busy || item.loading} onPress={() => onCopy(data.barcode)} />
      </>}
    </>}
  </WorkSheet>;
}

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[u.panel, u.row, { minHeight: 60, borderColor: selected ? C.accent : C.line, backgroundColor: selected ? C.soft : C.white }]}><Text style={[u.itemTitle, u.grow]}>{label}</Text><View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: selected ? C.accent : C.control, alignItems: 'center', justifyContent: 'center' }}>{selected && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.accent }} />}</View></Pressable>;
}
