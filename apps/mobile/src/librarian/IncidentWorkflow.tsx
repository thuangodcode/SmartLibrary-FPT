import React, { useRef, useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { apiRequest } from '../api';
import { conditionNames, dateOf, incidentNames, messageOf, moneyOf, useStaffData, type Incident, type StaffStats } from './data';
import { Action, C, Info, Loading, Notice, Section, Title, u } from './ui';
import { WorkSheet } from './WorkSheet';

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
      setMode('detail'); setNotes(''); item.reload(); onChanged();
    } catch (reason) { setError(messageOf(reason)); }
    finally { lock.current = false; setBusy(false); }
  };
  const confirm = (action: string, detail: string, body: object) => Alert.alert('Xác nhận kết quả xử lý?', detail, [{ text: 'Kiểm tra lại', style: 'cancel' }, { text: 'Xác nhận', onPress: () => void mutate(action, body) }]);
  const notesInput = <TextInput accessibilityLabel="Kết luận xác minh" multiline editable={!busy} maxLength={2000} style={[u.input, { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} placeholder="Mô tả đã kiểm tra gì và kết luận…" placeholderTextColor={C.muted} />;
  const conditionPicker = <Section title="Tình trạng sau khi kiểm tra">{['Good', 'Fair', 'LightDamaged'].map(value => <Choice key={value} label={conditionNames[value]} selected={condition === value} disabled={busy} onPress={() => setCondition(value)} />)}</Section>;
  return <WorkSheet title="Hồ sơ sự cố" busy={busy} onClose={onClose}>
    {item.loading ? <Loading /> : item.error ? <Notice text={item.error} error retry={item.reload} /> : data && <>
      <Title title={data.bookTitle} detail={`${data.barcode} · ${data.readerName}`} />
      <View style={u.panel}><Info label="Trách nhiệm / phí" value={incidentNames[data.status] || data.status} /><Info label="Mức độ đã xác minh" value={incidentNames[data.severity] || data.severity} /><Info label="Bản sao hiện tại" value={conditionNames[data.copyCondition] || data.copyCondition} /><Info label="Ngày ghi nhận" value={dateOf(data.createdAt)} /></View>
      {data.description && <Section title="Ghi nhận và kết quả kiểm tra"><Text selectable style={u.body}>{data.description}</Text></Section>}
      {!!error && <Notice text={error} error retry={item.reload} />}{!!message && <Notice text={message} />}
      {mode === 'restore' ? <Section title="Đã sửa hoặc tìm thấy sách">
        <Notice text="Chỉ xác nhận sau khi kiểm tra sách thực tế. Bản sao sẽ về kho chờ xếp; các khoản phí và lịch sử vẫn được giữ nguyên." />
        {conditionPicker}{notesInput}
        <Action title="Xác nhận đủ điều kiện sử dụng" busy={busy} disabled={!notes.trim()} onPress={() => confirm('restore-copy', `${conditionNames[condition]}\n${notes.trim()}\nBản sao về kho chờ xếp kệ.`, { condition, notes: notes.trim() })} />
        <Action title="Quay lại hồ sơ" secondary disabled={busy} onPress={() => setMode('detail')} />
      </Section> : mode === 'reject' ? <Section title="Từ chối trách nhiệm sự cố">
        <Notice text="Từ chối hồ sơ không tự đổi sách thành tốt. Nếu sách đã được trả/tìm thấy và còn sử dụng được, hãy xác nhận riêng bên dưới. Phí quá hạn, nếu có, vẫn được xử lý theo chính sách." />
        {data.loanStatus === 'Returned' && <View style={u.row}><Text style={[u.body, u.grow]}>Đã kiểm tra, sách đủ điều kiện sử dụng</Text><Switch accessibilityLabel="Cho bản sao sử dụng lại" value={restore} onValueChange={setRestore} disabled={busy} trackColor={{ true: C.accent }} /></View>}
        {restore && conditionPicker}{notesInput}
        <Action title="Xác nhận từ chối hồ sơ" busy={busy} disabled={!notes.trim()} onPress={() => confirm('reject', `${notes.trim()}\n${restore ? `Bản sao: ${conditionNames[condition]}, về kho chờ xếp.` : 'Giữ nguyên tình trạng bản sao.'}`, { notes: notes.trim(), restoreCopy: restore, ...(restore ? { condition } : {}) })} />
        <Action title="Quay lại xác minh" secondary disabled={busy} onPress={() => setMode('detail')} />
      </Section> : <>
        {data.status === 'PendingReview' ? <>
          {data.loanStatus !== 'Returned' ? <><Notice text="Độc giả đã báo sự cố nhưng phiếu chưa kết thúc. Ghi nhận nhận trả hoặc thất lạc trên phiếu trước khi xác nhận mức độ và phí." /><Action title="Mở phiếu để xử lý trả / thất lạc" onPress={() => onLoan(data.borrowRecordId)} /></> : <Section title="Xác minh mức độ">
            {data.kind === 'Lost' ? <Info label="Loại xác nhận" value="Thất lạc" /> : <><Choice label="Hư nhẹ — vẫn cho phép xếp kệ" selected={severity === 'Light'} disabled={busy} onPress={() => setSeverity('Light')} /><Choice label="Hư nặng — giữ kho, chặn xếp kệ" selected={severity === 'Severe'} disabled={busy} onPress={() => setSeverity('Severe')} /></>}
            {stats.loading ? <Loading text="Đang tải chính sách phí…" /> : stats.error ? <Notice text={stats.error} error retry={stats.reload} /> : <Info label="Bồi thường theo chính sách" value={!actualSeverity ? 'Chọn mức độ trước' : fee > 0 ? moneyOf(fee) : 'Chưa cấu hình'} />}
            {data.hasRecordedOverdueFine && <Notice text="Phí quá hạn đã có trên phiếu. Không lập thêm; xem và thanh toán khoản cũ trong chi tiết phiếu." />}
            {(data.suggestedOverdueFine || 0) > 0 && <View style={u.row}><Text style={[u.body, u.grow]}>Cộng quá hạn {moneyOf(data.suggestedOverdueFine!)}</Text><Switch accessibilityLabel="Cộng phí quá hạn" value={overdue} onValueChange={setOverdue} disabled={busy} trackColor={{ true: C.accent }} /></View>}
            <Info label="Tổng phí sẽ lập" value={actualSeverity ? moneyOf(total) : 'Chưa xác định'} />
            <Notice text={!actualSeverity ? 'Chọn mức độ theo kết quả kiểm tra sách thực tế trước khi xác nhận.' : actualSeverity === 'Light' ? 'Sau xác minh: hư nhẹ, còn sử dụng được, có thể xếp kệ ngay. Không cần chờ độc giả đóng phạt.' : actualSeverity === 'Lost' ? 'Sau xác minh: thất lạc, không được xếp kệ. Thanh toán không tự khôi phục sách.' : 'Sau xác minh: hư nặng, giữ trong kho và không được xếp kệ. Đóng phạt không tự đổi tình trạng sách.'} />
            {notesInput}<Action title="Xác nhận mức độ và lập phí" busy={busy} disabled={!notes.trim() || fee <= 0 || stats.loading || !!stats.error} onPress={() => confirm('confirm', `${incidentNames[actualSeverity]} · ${moneyOf(total)}\n${notes.trim()}`, { severity: actualSeverity, applyOverdue: overdue, notes: notes.trim() })} />
          </Section>}
          <Action title="Từ chối hồ sơ / tìm thấy sách" secondary disabled={busy} onPress={() => { setRestore(false); setNotes(''); setMode('reject'); }} />
        </> : <><Info label="Tổng phí đã lập" value={moneyOf(data.totalAmount)} /><Notice text={data.copyCondition === 'LightDamaged' ? 'Bản sao hư nhẹ vẫn được xếp kệ và cho mượn, độc lập với việc thanh toán phí.' : ['Damaged', 'Lost'].includes(data.copyCondition) ? 'Bản sao chưa đủ điều kiện sử dụng. Thanh toán không tự cho phép xếp kệ.' : 'Tình trạng bản sao và trách nhiệm thanh toán được theo dõi riêng.'} />
          {data.canRestoreCopy && <Action title="Đã sửa / tìm thấy — kiểm tra lại sách" onPress={() => { setNotes(''); setMode('restore'); }} />}
        </>}
        <Action title="Xem phiếu và phí liên quan" secondary disabled={busy} onPress={() => onLoan(data.borrowRecordId)} />
        <Action title="Xem vị trí / xếp kệ bản sao" secondary disabled={busy} onPress={() => onCopy(data.barcode)} />
      </>}
    </>}
  </WorkSheet>;
}

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[u.panel, { minHeight: 56, borderColor: selected ? C.accent : C.line, backgroundColor: selected ? C.soft : C.white }]}><Text style={u.itemTitle}>{selected ? '✓ ' : ''}{label}</Text></Pressable>;
}
