import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Boxes, CheckCircle2, ChevronRight, ClipboardCheck, Clock3 } from 'lucide-react-native';
import { useStaffData, type CopySummary, type LoanPage, type StaffStats } from './data';
import { LoanCard } from './Lists';
import { C, Loading, Notice, Title, u } from './ui';

export function Today({ token, revision, stats, onLoans, onWarehouse, onIncidents, onLoan }: {
  token: string; revision: number; stats: ReturnType<typeof useStaffData<StaffStats>>;
  onLoans: (status: string) => void; onWarehouse: () => void; onIncidents: () => void; onLoan: (id: string) => void;
}) {
  const copies = useStaffData<CopySummary>('/api/v1/copies/summary', token, revision);
  const value = stats.data;
  const previewStatus = value?.approved ? 'Approved' : value?.pending ? 'Pending' : value?.overdue ? 'Overdue' : 'Active';
  const preview = useStaffData<LoanPage>(`/api/v1/circulation/loans?page=1&pageSize=3&status=${previewStatus}`, token, revision);
  const count = (number?: number) => number === undefined ? '—' : number.toLocaleString('vi-VN');
  const incidentCount = value?.pendingIncidents || 0;
  const attention = incidentCount > 0 ? { title: `${count(incidentCount)} hồ sơ cần xác minh`, detail: 'Kiểm tra tình trạng sách và kết luận mức độ.', onPress: onIncidents }
    : value?.approved ? { title: `${count(value.approved)} phiếu đang chờ giao`, detail: 'Đối chiếu người nhận và đúng mã bản sao.', onPress: () => onLoans('Approved') }
    : value?.pending ? { title: `${count(value.pending)} yêu cầu chờ tiếp nhận`, detail: 'Xem yêu cầu mượn và chuẩn bị sách tại quầy.', onPress: () => onLoans('Pending') }
    : value?.overdue ? { title: `${count(value.overdue)} phiếu đã quá hạn`, detail: 'Theo dõi hạn trả; phí chỉ chốt khi nhận sách.', onPress: () => onLoans('Overdue') } : null;
  return <ScrollView contentContainerStyle={u.page} refreshControl={<RefreshControl refreshing={stats.loading || copies.loading || preview.loading} onRefresh={() => { stats.reload(); copies.reload(); preview.reload(); }} tintColor={C.accent} />}>
    <Title title="Hôm nay" detail={new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: 'numeric', month: 'long' })} />
    {stats.error && <Notice text={stats.error} error retry={stats.reload} />}
    {value ? attention ? <Pressable accessibilityRole="button" onPress={attention.onPress} style={({ pressed }) => [s.attention, pressed && u.pressed]}>
      <View style={u.row}><ClipboardCheck size={20} color={C.accent} /><Text style={s.attentionLabel}>Cần bạn xử lý</Text><View style={u.grow} /><ArrowRight size={20} color={C.accent} /></View>
      <Text style={s.attentionTitle}>{attention.title}</Text><Text style={s.attentionDetail}>{attention.detail}</Text>
    </Pressable> : <View style={s.attention}><View style={u.row}><CheckCircle2 size={20} color={C.accent} /><Text style={s.attentionLabel}>Sẵn sàng tại quầy</Text></View><Text style={s.attentionDetail}>Chưa có yêu cầu chờ hoặc sự cố cần xác minh. Quét một cuốn sách để bắt đầu.</Text></View> : !stats.error && <Loading text="Đang cập nhật công việc tại quầy…" />}
    <View style={u.section}><Text accessibilityRole="header" style={u.sectionTitle}>Tại quầy</Text><View style={s.counterPanel}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Chờ tiếp nhận, ${count(value?.pending)} phiếu`} onPress={() => onLoans('Pending')} style={({ pressed }) => [s.counter, pressed && u.pressed]}><Text style={s.counterLabel}>Chờ tiếp nhận</Text><Text style={s.counterNumber}>{count(value?.pending)}</Text><View style={u.row}><Text style={s.smallAction}>Xem yêu cầu</Text><ChevronRight size={15} color={C.accent} /></View></Pressable>
      <View style={s.separator} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Chờ giao sách, ${count(value?.approved)} phiếu`} onPress={() => onLoans('Approved')} style={({ pressed }) => [s.counter, pressed && u.pressed]}><Text style={s.counterLabel}>Chờ giao sách</Text><Text style={s.counterNumber}>{count(value?.approved)}</Text><View style={u.row}><Text style={s.smallAction}>Đối chiếu giao</Text><ChevronRight size={15} color={C.accent} /></View></Pressable>
    </View></View>
    <View style={u.section}><Text accessibilityRole="header" style={u.sectionTitle}>Theo dõi mượn trả</Text><View style={s.tracking}>
      <Pressable accessibilityRole="button" onPress={() => onLoans('Active')} style={({ pressed }) => [s.metric, pressed && u.pressed]}><Text style={s.metricLabel}>Đang mượn</Text><Text style={s.metricNumber}>{count(value?.borrowed)}</Text><Text style={s.metricHint}>Xem phiếu →</Text></Pressable>
      <View style={s.separator} /><View style={s.metric}><Text style={s.metricLabel}>Sắp đến hạn</Text><Text style={s.metricNumber}>{count(value?.dueSoon)}</Text><Text style={s.metricHint}>Trong 3 ngày</Text></View><View style={s.separator} />
      <Pressable accessibilityRole="button" onPress={() => onLoans('Overdue')} style={({ pressed }) => [s.metric, pressed && u.pressed]}><Text style={s.metricLabel}>Quá hạn</Text><Text style={[s.metricNumber, !!value?.overdue && { color: C.red }]}>{count(value?.overdue)}</Text><Text style={s.metricHint}>Kiểm tra →</Text></Pressable>
    </View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Sách trong kho, xem bản sao chờ xếp kệ" onPress={onWarehouse} style={({ pressed }) => [s.warehouse, pressed && u.pressed]}><Boxes size={25} color={C.accent} /><View style={u.grow}><Text style={u.itemTitle}>Sách chờ xếp kệ</Text><Text style={u.body}>Trong kho · đủ điều kiện sử dụng</Text></View><Text style={s.warehouseCount}>{count(copies.data?.warehouseCopies)}</Text><ChevronRight size={19} color={C.accent} /></Pressable>
    {copies.error && <Notice text={copies.error} error retry={copies.reload} />}
    <View style={u.section}>
      <View style={u.row}><Text accessibilityRole="header" style={[u.sectionTitle, u.grow]}>{previewStatus === 'Approved' ? 'Chuẩn bị giao sách' : previewStatus === 'Pending' ? 'Yêu cầu mới' : previewStatus === 'Overdue' ? 'Cần theo dõi hạn trả' : 'Phiếu đang theo dõi'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Xem tất cả phiếu đang theo dõi" onPress={() => onLoans(previewStatus)} style={s.viewAll}><Text style={s.smallAction}>Xem tất cả</Text></Pressable></View>
      {preview.error && <Notice text={preview.error} error retry={preview.reload} />}
      {preview.loading && !preview.data ? <Loading text="Đang tải phiếu…" /> : preview.data?.items.length ? preview.data.items.map(loan => <LoanCard key={loan.id} loan={loan} onOpen={onLoan} />) : !preview.error && <View style={u.panel}><View style={u.row}><Clock3 size={20} color={C.muted} /><Text style={[u.body, u.grow]}>Chưa có phiếu trong nhóm này. Bạn có thể kiểm tra các nhóm khác tại Mượn trả.</Text></View></View>}
    </View>
  </ScrollView>;
}
const s = StyleSheet.create({
  attention: { backgroundColor: C.soft, borderRadius: 20, padding: 18, gap: 10 }, attentionLabel: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: C.accent }, attentionTitle: { fontSize: 21, lineHeight: 28, fontWeight: '700', letterSpacing: -0.35, color: C.ink }, attentionDetail: { fontSize: 14, lineHeight: 21, color: '#78503b' },
  counterPanel: { flexDirection: 'row', backgroundColor: C.white, borderRadius: 20, borderWidth: 1, borderColor: C.line, paddingVertical: 18 }, counter: { flex: 1, paddingHorizontal: 18, gap: 7 }, counterLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: C.muted }, counterNumber: { fontSize: 30, lineHeight: 36, color: C.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }, smallAction: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: C.accent }, separator: { width: 1, backgroundColor: C.line, marginVertical: 4 },
  tracking: { flexDirection: 'row', backgroundColor: C.white, borderRadius: 20, paddingVertical: 16, borderWidth: 1, borderColor: C.line }, metric: { flex: 1, alignItems: 'center', paddingHorizontal: 5, gap: 6 }, metricLabel: { fontSize: 12, lineHeight: 18, fontWeight: '500', color: C.muted }, metricNumber: { fontSize: 25, lineHeight: 31, color: C.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }, metricHint: { fontSize: 12, lineHeight: 18, color: C.muted },
  warehouse: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: C.white, borderRadius: 20, borderWidth: 1, borderColor: C.line }, warehouseCount: { fontSize: 24, fontWeight: '600', color: C.ink, fontVariant: ['tabular-nums'] }, viewAll: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
});
