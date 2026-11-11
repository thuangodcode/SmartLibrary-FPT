import React, { useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { apiRequest } from '../api';
import { LoanInformation } from './CopyWorkflow';
import { dateOf, fineNames, incidentNames, messageOf, moneyOf, useStaffData, type LoanDetail } from './data';
import { Scanner } from './Scanner';
import { Action, Badge, BookIdentity, C, Disclosure, Info, LinkRow, Loading, Notice, Section, u } from './ui';
import { WorkSheet } from './WorkSheet';
import { successFeedback } from './feedback';

export function LoanWorkflow({ id, token, onClose, onChanged, onCopy, onIncident }: { id: string; token: string; onClose: () => void; onChanged: () => void; onCopy: (code: string, returnLoanId?: string) => void; onIncident: (id: string) => void }) {
  const result = useStaffData<LoanDetail>(`/api/v1/circulation/loans/${id}/detail`, token);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'detail' | 'reject' | 'verify' | 'handoff'>('detail');
  const [notes, setNotes] = useState(''); const [verifiedCode, setVerifiedCode] = useState('');
  const loan = result.data?.loan;
  const mutate = async (path: string, body?: object) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await apiRequest(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }, token);
      setMessage(typeof response.meta?.message === 'string' ? response.meta.message : 'Đã cập nhật phiếu.');
      setMode('detail'); setVerifiedCode(''); successFeedback(); result.reload(); onChanged();
    } catch (reason) { setError(messageOf(reason)); }
    finally { lock.current = false; setBusy(false); }
  };
  const confirm = (title: string, detail: string, path: string, body?: object) => Alert.alert(title, detail, [{ text: 'Kiểm tra lại', style: 'cancel' }, { text: 'Xác nhận', onPress: () => void mutate(path, body) }]);
  const endpoint = `/api/v1/circulation/loans/${id}`;
  const footer = loan ? mode === 'handoff' ? <><Action title="Xác nhận đã giao sách" busy={busy || result.loading} disabled={!!error || result.loading} onPress={() => void mutate(`${endpoint}/checkout`, { barcode: verifiedCode })} /><Action title="Quét lại" secondary disabled={busy || result.loading} onPress={() => { setError(''); setMode('verify'); }} /></>
    : mode === 'reject' ? <Action title="Xác nhận từ chối yêu cầu" busy={busy || result.loading} disabled={!notes.trim() || result.loading} onPress={() => confirm('Từ chối yêu cầu?', `${loan.readerName} · ${loan.barcode}\n${notes.trim()}`, `${endpoint}/reject`, { notes: notes.trim() })} />
    : mode === 'detail' && loan.status === 'Pending' ? <Action title="Tiếp nhận yêu cầu mượn" busy={busy || result.loading} onPress={() => confirm('Tiếp nhận yêu cầu?', `${loan.readerName} · ${loan.barcode}\nSách sẽ được giữ chờ giao tại quầy.`, `${endpoint}/approve`)} />
    : mode === 'detail' && loan.status === 'Approved' ? <Action title="Đối chiếu và quét để giao sách" disabled={busy || result.loading} onPress={() => { setError(''); setMode('verify'); }} />
    : mode === 'detail' && ['Borrowed', 'Overdue'].includes(loan.status) ? <Action title="Xử lý trả sách" disabled={busy || result.loading} onPress={() => onCopy(loan.barcode, id)} /> : undefined : undefined;
  return <WorkSheet title={mode === 'verify' || mode === 'handoff' ? 'Đối chiếu giao sách' : mode === 'reject' ? 'Từ chối yêu cầu' : 'Chi tiết phiếu mượn'} busy={busy} onClose={onClose} onBack={mode !== 'detail' ? () => { setMode('detail'); setError(''); } : undefined} footer={footer}>
    {result.loading && !loan ? <Loading /> : !loan && result.error ? <Notice text={result.error} error retry={result.reload} /> : loan && <>
      <BookIdentity title={loan.bookTitle} code={loan.barcode} cover={loan.coverImageUrl} />
      {(mode === 'detail' || mode === 'reject') && <LoanInformation loan={loan} compact={mode === 'reject'} />}
      {result.error && <Notice text={result.error} error retry={result.reload} />}{!!error && <Notice text={error} error retry={result.reload} />}{!!message && <Notice text={message} success />}
      {mode === 'verify' ? <><Notice text={`Đối chiếu độc giả ${loan.readerName}${loan.studentId ? ` (${loan.studentId})` : ''}, sau đó quét đúng cuốn ${loan.barcode} để giao.`} /><Scanner purpose="checkout" paused={busy} onCode={code => {
        if (code.trim().toUpperCase() !== loan.barcode.toUpperCase()) { setError('Mã không khớp bản sao trên phiếu. Chưa giao sách; hãy quét lại.'); return; }
        setVerifiedCode(code.trim()); setError(''); setMode('handoff');
      }} /><Action title="Quay lại phiếu" secondary onPress={() => setMode('detail')} /></> : mode === 'handoff' ? <Section title="Đối chiếu trước khi giao">
        <Info label="Đã khớp bản sao" value={verifiedCode} /><Info label="Giao cho" value={loan.readerName} /><Notice text="Xác nhận sau khi đã kiểm tra người nhận và bàn giao sách thực tế. Thời hạn mượn sẽ do hệ thống tính khi giao thành công." />
      </Section> : mode === 'reject' ? <Section title="Lý do từ chối / huỷ tiếp nhận">
        <TextInput accessibilityLabel="Lý do từ chối" style={[u.input, { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' }]} multiline maxLength={2000} value={notes} onChangeText={setNotes} editable={!busy} placeholder="Ghi lý do để độc giả biết…" placeholderTextColor={C.muted} />
        <Text style={u.body}>{notes.length}/2.000 ký tự · Lý do này sẽ được lưu trên phiếu.</Text><Action title="Giữ lại yêu cầu" secondary disabled={busy || result.loading} onPress={() => setMode('detail')} />
      </Section> : <>
        {['Pending', 'Approved'].includes(loan.status) && <Action title="Từ chối / huỷ tiếp nhận" secondary disabled={busy || result.loading} onPress={() => { setNotes(''); setMode('reject'); }} />}
        {['Borrowed', 'Overdue'].includes(loan.status) && <Action title="Gia hạn theo chính sách" secondary busy={busy || result.loading} disabled={loan.canRenew === false || result.loading} onPress={() => confirm('Gia hạn phiếu?', `${loan.code} · ${loan.readerName}\nHệ thống sẽ kiểm tra điều kiện và tính lại hạn trả.`, `${endpoint}/renew`)} />}
        {['Borrowed', 'Overdue'].includes(loan.status) && loan.canRenew === false && loan.renewalUnavailableReason && <Notice text={loan.renewalUnavailableReason} />}
        <View style={u.panel}><Text style={u.itemTitle}>Kết quả và thanh toán</Text><Badge label={result.data!.fines.some(fine => fine.status === 'Pending') ? 'Còn khoản chưa thanh toán' : result.data!.fines.length ? 'Đã thanh toán hoặc miễn' : 'Chưa lập khoản phí'} tone={result.data!.fines.some(fine => fine.status === 'Pending') ? 'warning' : 'neutral'} />{loan.returnDate && <Info label="Ngày ghi nhận trả" value={dateOf(loan.returnDate)} />}{result.data!.fines.some(fine => fine.status === 'Pending') && <Info label="Còn cần thanh toán" value={moneyOf(result.data!.fines.filter(fine => fine.status === 'Pending').reduce((sum, fine) => sum + fine.amount, 0))} danger />}</View>
        {loan.notes && <Disclosure title="Ghi chú trên phiếu" detail="Ghi nhận khi mượn và trả"><Text selectable style={u.body}>{loan.notes}</Text></Disclosure>}
        <Disclosure title="Hồ sơ sự cố" detail={`${result.data!.incidents.length} hồ sơ liên quan`} initiallyOpen={result.data!.incidents.some(item => item.status === 'PendingReview')}>{result.data!.incidents.length ? result.data!.incidents.map(item => <LinkRow key={item.id} title={`${incidentNames[item.kind]} · ${incidentNames[item.status] || item.status}`} detail={item.description || 'Xem kết quả xác minh'} onPress={() => onIncident(item.id)} />) : <Text style={u.body}>Phiếu chưa ghi nhận sự cố.</Text>}</Disclosure>
        <Section title="Phí của phiếu">{result.data!.fines.length ? result.data!.fines.map(fine => <View style={u.panel} key={fine.id}><Text style={u.itemTitle}>{fine.reason}</Text><Info label={fineNames[fine.status] || fine.status} value={moneyOf(fine.amount)} danger={fine.status === 'Pending'} />{fine.status === 'Pending' && <Action title="Ghi nhận đã thu tiền mặt" secondary busy={busy || result.loading} onPress={() => confirm('Xác nhận đã nhận tiền mặt?', `${loan.readerName}\n${fine.reason}: ${moneyOf(fine.amount)}\nChỉ xác nhận sau khi đã nhận đủ số tiền.`, `/api/v1/circulation/fines/${fine.id}/pay/cash`)} />}</View>) : <Text style={u.body}>Chưa có khoản phí được lập cho phiếu này.</Text>}</Section>
        <Action title="Xem bản sao và vị trí hiện tại" secondary onPress={() => onCopy(loan.barcode)} disabled={busy || result.loading} />
      </>}
    </>}
  </WorkSheet>;
}
