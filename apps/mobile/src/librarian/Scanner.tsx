import React, { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { isDevice } from 'expo-device';
import { KeyboardScrollView } from '../KeyboardScrollView';
import { Action, C, Notice, Title, u } from './ui';

export function Scanner({ onCode, paused, purpose = 'lookup' }: { onCode: (code: string) => void; paused: boolean; purpose?: 'lookup' | 'checkout' }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [ready, setReady] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const locked = useRef(false);
  useEffect(() => {
    let active = true;
    const cameraAvailable = Platform.OS === 'web' ? CameraView.isAvailableAsync() : Promise.resolve(isDevice);
    void cameraAvailable.then(value => { if (active) { setAvailable(value); if (!value) setMode('manual'); } })
      .catch(() => { if (active) { setAvailable(false); setMode('manual'); } });
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => { if (!paused) locked.current = false; }, [paused]);

  const accept = (raw: string) => {
    if (paused || locked.current) return;
    const value = raw.trim();
    if (!value || value.length > 100 || /[\r\n]|:\/\//.test(value)) {
      setError('Hãy dùng mã bản sao ghi dưới QR của thư viện, ví dụ KHTN002-01.');
      return;
    }
    locked.current = true; setReady(false); setError(''); Keyboard.dismiss(); onCode(value);
  };

  return <KeyboardScrollView contentContainerStyle={purpose === 'checkout' ? u.section : u.page}>
    <Title title={purpose === 'checkout' ? 'Quét để giao sách' : 'Quét bản sao'} detail={purpose === 'checkout' ? 'Quét QR hoặc nhập mã để đối chiếu với bản sao trên phiếu.' : 'Nhận diện cuốn sách để trả hoặc xếp lên kệ.'} />
    <View style={s.tabs}>{([{ id: 'camera', title: 'Camera' }, { id: 'manual', title: 'Nhập mã' }] as const).map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: mode === item.id }} onPress={() => { setMode(item.id); setError(''); }} style={[s.tab, mode === item.id && s.selected]}><Text style={[s.tabText, mode === item.id && { color: C.ink }]}>{item.title}</Text></Pressable>)}</View>
    {mode === 'camera' && <View style={s.cameraFrame}>
      {available && permission?.granted && foreground && !paused && !cameraError ? <CameraView
        style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128'] }}
        onBarcodeScanned={ready ? ({ data }) => accept(data) : undefined} onMountError={() => setCameraError('Không thể mở camera. Bạn có thể nhập mã bản sao bên dưới.')}>
        <View pointerEvents="none" style={s.viewfinder}><View style={s.frame} />{ready && <Text style={s.cameraText}>Đặt QR của bản sao trong khung</Text>}</View>
        {!ready && <View style={s.scanAgain}><Action title="Quét mã tiếp theo" onPress={() => { locked.current = false; setReady(true); setError(''); }} /></View>}
      </CameraView> : <View style={s.cameraPlaceholder}><Text style={s.cameraTitle}>{available === false ? 'Dùng mã bản sao để tra cứu' : cameraError ? 'Camera chưa sẵn sàng' : 'Quét QR bằng camera'}</Text><Text style={s.cameraHint}>{available === false ? 'Thiết bị này không có camera khả dụng. Chuyển sang Nhập mã để tiếp tục.' : cameraError || 'Cho phép camera để đọc QR digital đang mở trên web.'}</Text>{available && !permission?.granted && <Action title={permission?.canAskAgain === false ? 'Mở cài đặt camera' : 'Cho phép camera'} onPress={() => {
        if (permission?.canAskAgain === false) void Linking.openSettings();
        else void requestPermission().catch(() => setCameraError('Không thể yêu cầu quyền camera. Hãy dùng Nhập mã.'));
      }} />}{(available === false || cameraError) && <Action title="Nhập mã bản sao" onPress={() => setMode('manual')} secondary />}</View>}
    </View>}
    {mode === 'manual' && <View style={u.panel}><Text style={u.itemTitle}>Mã bản sao</Text><TextInput accessibilityLabel="Mã bản sao" value={code} onChangeText={text => { setCode(text); locked.current = false; setReady(true); setError(''); }} autoCapitalize="characters" autoCorrect={false} placeholder="Ví dụ: KHTN002-01" placeholderTextColor={C.muted} style={u.input} returnKeyType="search" maxLength={100} onSubmitEditing={() => accept(code)} editable={!paused} /><Action title={purpose === 'checkout' ? 'Đối chiếu mã bản sao' : 'Tra cứu bản sao'} onPress={() => accept(code)} disabled={!code.trim() || paused} /></View>}
    {!!error && <Notice text={error} error />}
    {purpose === 'lookup' && <View style={s.help}><Text style={u.sectionTitle}>Mỗi cuốn, một mã riêng</Text><Text style={u.body}>Quét QR trong mục Bản sao & kệ sách trên web. Mã bản sao có dạng KHTN002-01, khác với ISBN in trên bìa sách.</Text><Text style={u.body}>Sau khi nhận diện, bạn sẽ kiểm tra thông tin và xác nhận trước khi thay đổi dữ liệu.</Text></View>}
  </KeyboardScrollView>;
}
const s = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.line }, tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' }, selected: { borderColor: C.accent }, tabText: { fontSize: 15, fontWeight: '600', color: C.muted },
  cameraFrame: { height: 320, borderRadius: 16, overflow: 'hidden', backgroundColor: '#18202c' }, cameraPlaceholder: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 }, cameraTitle: { color: '#fff', fontSize: 20, lineHeight: 27, fontWeight: '600' }, cameraHint: { color: '#d4d9df', fontSize: 14, lineHeight: 21 },
  viewfinder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }, frame: { width: 210, height: 210, borderRadius: 16, borderWidth: 2, borderColor: '#fff' }, cameraText: { color: '#fff', fontSize: 14, backgroundColor: '#18202c', padding: 8 }, scanAgain: { position: 'absolute', bottom: 16, left: 20, right: 20 }, help: { gap: 12 },
});
