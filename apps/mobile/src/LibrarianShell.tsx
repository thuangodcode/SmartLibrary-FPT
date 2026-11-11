import React, { useEffect, useState } from 'react';
import { Alert, AppState, BackHandler, Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, CircleUserRound, ClipboardList, Home, LogOut, QrCode, RotateCcw, ShieldCheck, TriangleAlert, X } from 'lucide-react-native';
import { useSession } from './session';
import type { User } from './types';
import { CopyWorkflow } from './librarian/CopyWorkflow';
import { LoanWorkflow } from './librarian/LoanWorkflow';
import { IncidentWorkflow } from './librarian/IncidentWorkflow';
import { Scanner } from './librarian/Scanner';
import { Today } from './librarian/Today';
import { Incidents, Loans, Warehouse } from './librarian/Lists';
import { useStaffData, type StaffStats } from './librarian/data';
import { scanFeedback } from './librarian/feedback';
import { Action, Badge, C, Info, Title, u } from './librarian/ui';

type Workflow = { kind: 'copy'; id: string; returnLoanId?: string } | { kind: 'loan' | 'incident'; id: string };
type Tab = 'today' | 'loans' | 'incidents' | 'account';
const nav = [{ id: 'today', label: 'Hôm nay', icon: Home }, { id: 'loans', label: 'Mượn trả', icon: ClipboardList }, { id: 'scan', label: 'Quét', icon: QrCode }, { id: 'incidents', label: 'Sự cố', icon: TriangleAlert }, { id: 'account', label: 'Tài khoản', icon: CircleUserRound }] as const;

export function LibrarianShell({ user, token }: { user: User; token: string }) {
  const [tab, setTab] = useState<Tab>('today');
  const [visited, setVisited] = useState<Tab[]>(['today']);
  const [warehouse, setWarehouse] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSession, setScanSession] = useState(0);
  const [loanRoute, setLoanRoute] = useState({ status: 'Active', key: 0 });
  const [incidentRoute, setIncidentRoute] = useState(0);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const current = workflows[workflows.length - 1];
  const openCopy = (id: string, returnLoanId?: string) => setWorkflows(items => [...items, { kind: 'copy', id, returnLoanId }]);
  const openLoan = (id: string) => setWorkflows(items => [...items, { kind: 'loan', id }]);
  const openIncident = (id: string) => setWorkflows(items => [...items, { kind: 'incident', id }]);
  const closeWorkflow = () => setWorkflows(items => items.slice(0, -1));
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  const stats = useStaffData<StaffStats>('/api/v1/circulation/stats', token, revision);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') setRevision(value => value + 1); });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (scanning && !current) { setScanning(false); return true; }
      if (warehouse && !current) { setWarehouse(false); return true; }
      return false;
    });
    return () => listener.remove();
  }, [scanning, warehouse, current]);
  const go = (next: Tab) => { setWarehouse(false); setTab(next); setVisited(items => items.includes(next) ? items : [...items, next]); };
  const loans = (status: string) => { setLoanRoute(value => ({ status, key: value.key + 1 })); go('loans'); };
  const incidents = () => { setIncidentRoute(value => value + 1); go('incidents'); };
  const scanNext = () => { setWorkflows([]); setScanSession(value => value + 1); setScanning(true); };
  const pending = stats.data?.pendingIncidents || 0;
  return <SafeAreaView edges={['top', 'bottom']} style={s.root}>
    <StatusBar barStyle="dark-content" />
    <View style={s.header}>{scanning ? <><Pressable accessibilityRole="button" accessibilityLabel="Đóng camera, trở về màn trước" onPress={() => setScanning(false)} style={u.iconButton}><ChevronLeft size={22} color={C.ink} /></Pressable><Text style={u.itemTitle}>Quét bản sao</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng camera" onPress={() => setScanning(false)} style={u.iconButton}><X size={20} color={C.muted} /></Pressable></> : <><Pressable accessibilityRole="button" accessibilityLabel="Về Hôm nay" onPress={() => go('today')} style={[u.row, { gap: 9 }]}><Image source={require('../assets/smartlibrary-logo.png')} style={s.logo} /><View><Text style={s.brand}>SmartLibrary</Text><Text style={s.scope}>Không gian thủ thư</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Làm mới dữ liệu" onPress={refresh} style={[u.iconButton, { backgroundColor: C.white }]}><RotateCcw size={19} color={C.muted} /></Pressable></>}
    </View>
    {/* Mounted tabs keep filters and native scroll position while camera/details cover them. */}
    <View style={[s.canvas, scanning && s.hidden]}>
      <View style={[s.screen, tab !== 'today' && s.hidden]}><View style={[s.screen, warehouse && s.hidden]}><Today token={token} revision={revision} stats={stats} onLoans={loans} onWarehouse={() => setWarehouse(true)} onIncidents={incidents} onLoan={openLoan} /></View>{warehouse && <Warehouse token={token} revision={revision} onOpen={openCopy} onBack={() => setWarehouse(false)} />}</View>
      {visited.includes('loans') && <View style={[s.screen, tab !== 'loans' && s.hidden]}><Loans token={token} revision={revision} route={loanRoute} onOpen={openLoan} /></View>}
      {visited.includes('incidents') && <View style={[s.screen, tab !== 'incidents' && s.hidden]}><Incidents token={token} revision={revision} routeKey={incidentRoute} onOpen={openIncident} /></View>}
      {visited.includes('account') && <View style={[s.screen, tab !== 'account' && s.hidden]}><Account user={user} /></View>}
    </View>
    {scanning && <View style={s.canvas}><Scanner key={scanSession} onCode={openCopy} paused={!!current} /></View>}
    {!scanning && <View style={s.nav}><View pointerEvents="none" style={s.navSurface} />{nav.map(item => {
      if (item.id === 'scan') return <View key={item.id} style={s.scanSlot}><Pressable accessibilityRole="button" accessibilityLabel="Quét mã bản sao" onPress={() => { scanFeedback(); setScanning(true); }} style={({ pressed }) => [s.scanButton, pressed && u.pressed]}><QrCode size={27} color={C.white} strokeWidth={2} /></Pressable><Text style={s.scanLabel}>Quét</Text></View>;
      const Icon = item.icon; const selected = tab === item.id;
      return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.id === 'incidents' && pending > 0 ? `Sự cố, ${pending} hồ sơ chờ xác minh` : item.label} accessibilityState={{ selected }} onPress={() => go(item.id)} style={s.navItem}><View style={[s.navMark, selected && s.navMarkActive]}><Icon size={22} color={selected ? C.accent : C.muted} strokeWidth={selected ? 2.2 : 1.7} />{item.id === 'incidents' && pending > 0 && <View style={s.navBadge}><Text style={s.navBadgeText}>{pending > 99 ? '99+' : pending}</Text></View>}</View><Text style={[s.navLabel, selected && { color: C.accent, fontWeight: '600' }]}>{item.label}</Text></Pressable>;
    })}</View>}
    {current?.kind === 'copy' && <CopyWorkflow key={`copy-${workflows.length}-${current.id}`} code={current.id} returnLoanId={current.returnLoanId} token={token} onClose={closeWorkflow} onChanged={refresh} onLoan={openLoan} onIncident={openIncident} onScanNext={scanNext} />}
    {current?.kind === 'loan' && <LoanWorkflow key={`loan-${workflows.length}-${current.id}`} id={current.id} token={token} onClose={closeWorkflow} onChanged={refresh} onCopy={openCopy} onIncident={openIncident} />}
    {current?.kind === 'incident' && <IncidentWorkflow key={`incident-${workflows.length}-${current.id}`} id={current.id} token={token} onClose={closeWorkflow} onChanged={refresh} onCopy={openCopy} onLoan={openLoan} />}
  </SafeAreaView>;
}
function Account({ user }: { user: User }) {
  const { signOut } = useSession(); const [busy, setBusy] = useState(false);
  const initials = user.fullName.split(' ').filter(Boolean).slice(-2).map(word => word[0]).join('').toUpperCase();
  return <ScrollView contentContainerStyle={u.page}><Title title="Tài khoản" detail="Thông tin phiên làm việc của bạn" /><View style={[u.panel, { alignItems: 'center', paddingVertical: 28 }]}><View style={s.avatar}><Text style={s.initials}>{initials}</Text></View><Text style={u.sectionTitle}>{user.fullName}</Text><Text style={u.body}>{user.email}</Text><Badge label="Thủ thư" tone="accent" /></View><View style={u.panel}><View style={u.row}><ShieldCheck size={20} color={C.green} /><Text style={u.itemTitle}>Phiên làm việc</Text></View><Info label="Trạng thái tài khoản" value={user.status === 'Active' ? 'Đang hoạt động' : user.status} /><Text style={u.body}>Mượn trả, xử lý sự cố và vị trí bản sao được cập nhật theo quyền thủ thư.</Text></View><View style={u.row}><LogOut size={19} color={C.muted} /><View style={u.grow}><Action title="Đăng xuất" secondary busy={busy} onPress={() => Alert.alert('Kết thúc phiên làm việc?', 'Bạn có thể đăng nhập lại để tiếp tục xử lý sách.', [{ text: 'Ở lại', style: 'cancel' }, { text: 'Đăng xuất', style: 'destructive', onPress: () => { setBusy(true); void signOut().catch(() => { setBusy(false); Alert.alert('Chưa thể đăng xuất', 'Vui lòng thử lại.'); }); } }])} /></View></View></ScrollView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, header: { minHeight: 62, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, logo: { width: 30, height: 34, resizeMode: 'contain' }, brand: { fontSize: 18, fontWeight: '700', color: C.ink, letterSpacing: -0.4 }, scope: { fontSize: 12, lineHeight: 18, color: C.muted },
  canvas: { flex: 1, backgroundColor: C.bg }, screen: { flex: 1 }, hidden: { display: 'none' }, nav: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 20, minHeight: 84 }, navSurface: { position: 'absolute', top: 20, bottom: 0, left: 0, right: 0, backgroundColor: C.white, borderTopWidth: 1, borderColor: C.line }, navItem: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 3 }, navMark: { width: 48, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, navMarkActive: { backgroundColor: C.soft }, navLabel: { fontSize: 11, lineHeight: 17, color: C.muted }, navBadge: { position: 'absolute', top: -5, right: -3, backgroundColor: C.red, minWidth: 18, minHeight: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' }, navBadgeText: { fontSize: 11, lineHeight: 16, color: C.white, fontWeight: '700' },
  scanSlot: { flex: 1, marginTop: -18, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 7 }, scanButton: { position: 'absolute', width: 60, height: 60, top: 0, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, borderWidth: 4, borderColor: C.bg, shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 7, elevation: 5 }, scanLabel: { fontSize: 11, lineHeight: 17, color: C.accent, fontWeight: '600' }, avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }, initials: { fontSize: 23, fontWeight: '600', color: C.accent },
});
