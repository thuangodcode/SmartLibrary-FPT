import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { apiRequest } from './api';
import { COLORS } from './config';
import { useSession } from './session';

type AuthMode = 'login' | 'forgot' | 'reset' | 'register' | 'registerOtp' | 'registerDocs' | 'pending';
type ImageAsset = ImagePicker.ImagePickerAsset;
type FieldProps = { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric'; autoCapitalize?: 'none' | 'words' | 'sentences'; multiline?: boolean };

const logo = require('../assets/smartlibrary-logo.png');

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType = 'default', autoCapitalize = 'sentences', multiline }: FieldProps) {
  return <View style={styles.fieldWrap}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#929e95" secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={false} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} style={[styles.input, multiline && styles.multiline]} /></View>;
}

function Link({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable onPress={onPress} hitSlop={8}><Text style={styles.link}>{title}</Text></Pressable>;
}

export function AuthFlow() {
  const { signIn } = useSession();
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const [mode, setMode] = useState<AuthMode | 'welcome'>('welcome');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [otp, setOtp] = useState('');
  const [documentType, setDocumentType] = useState<'NationalId' | 'StudentCard' | 'DriverLicense'>('NationalId');
  const [front, setFront] = useState<ImageAsset | null>(null);
  const [back, setBack] = useState<ImageAsset | null>(null);
  const [selfie, setSelfie] = useState<ImageAsset | null>(null);
  const [notice, setNotice] = useState('');

  const notifyError = (error: unknown, title: string) => Alert.alert(title, error instanceof Error ? error.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.');
  const startLogin = () => { setMode('login'); setNotice(''); };
  const sendRegistrationOtp = async () => {
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword || !phone.trim() || !address.trim() || !dateOfBirth.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng điền đầy đủ thông tin cá nhân, ngày sinh, địa chỉ thư điện tử và mật khẩu.'); return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { Alert.alert('Địa chỉ thư điện tử chưa hợp lệ', 'Hãy kiểm tra lại địa chỉ thư điện tử.'); return; }
    if (password.length < 8) { Alert.alert('Mật khẩu quá ngắn', 'Mật khẩu cần có ít nhất 8 ký tự.'); return; }
    if (password !== confirmPassword) { Alert.alert('Mật khẩu không khớp', 'Mật khẩu xác nhận chưa trùng khớp.'); return; }
    setBusy(true);
    try { await apiRequest('/api/v1/auth/send-otp', { method: 'POST', body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() }) }); setMode('registerOtp'); setNotice(`Mã xác minh đã được gửi đến ${email.trim()}.`); }
    catch (error) { notifyError(error, 'Không gửi được mã xác minh'); }
    finally { setBusy(false); }
  };
  const verifyRegistrationOtp = async () => {
    if (!/^\d{6}$/.test(otp)) { Alert.alert('Mã xác minh chưa hợp lệ', 'Nhập đủ 6 chữ số trong thư điện tử.'); return; }
    setBusy(true);
    try { await apiRequest('/api/v1/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email: email.trim(), otp }) }); setMode('registerDocs'); setNotice('Địa chỉ thư điện tử đã được xác minh. Hãy tải giấy tờ để hoàn tất hồ sơ.'); }
    catch (error) { notifyError(error, 'Xác minh thất bại'); }
    finally { setBusy(false); }
  };
  const pickImage = async (kind: 'front' | 'back' | 'selfie') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('Cần quyền truy cập ảnh', 'Cho phép SmartLibrary truy cập thư viện ảnh để chọn giấy tờ xác minh.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.75, selectionLimit: 1 });
    if (!result.canceled && result.assets[0]) ({ front: setFront, back: setBack, selfie: setSelfie }[kind])(result.assets[0]);
  };
  const submitRegistration = async () => {
    if (!front) { Alert.alert('Thiếu giấy tờ', 'Ảnh mặt trước là bắt buộc.'); return; }
    if (documentType === 'NationalId' && !back) { Alert.alert('Thiếu mặt sau', 'CCCD/CMND cần ảnh cả hai mặt.'); return; }
    setBusy(true);
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries({ fullName: fullName.trim(), email: email.trim(), password, phone: phone.trim(), address: address.trim(), dateOfBirth, documentType, otp })) form.append(key, value);
      const appendImage = (key: string, asset: ImageAsset | null) => { if (asset) form.append(key, { uri: asset.uri, name: asset.fileName || `${key}.jpg`, type: asset.mimeType || 'image/jpeg' } as unknown as Blob); };
      appendImage('front', front); appendImage('back', back); appendImage('selfie', selfie);
      await apiRequest('/api/v1/auth/register-reader', { method: 'POST', body: form as unknown as BodyInit });
      setPassword(''); setConfirmPassword('');
      setMode('pending'); setNotice('Hồ sơ đã được gửi đến thủ thư. Bạn có thể đăng nhập sau khi tài khoản được phê duyệt.');
    } catch (error) { notifyError(error, 'Không gửi được hồ sơ'); }
    finally { setBusy(false); }
  };
  const submitForgot = async () => {
    if (!email.trim()) { Alert.alert('Thiếu địa chỉ thư điện tử', 'Nhập địa chỉ thư điện tử của tài khoản.'); return; }
    setBusy(true);
    try { await apiRequest('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim() }) }); setNotice('Nếu địa chỉ này có tài khoản, mã khôi phục đã được gửi. Hãy kiểm tra cả thư mục thư rác.'); setMode('reset'); }
    catch (error) { notifyError(error, 'Không gửi được yêu cầu'); }
    finally { setBusy(false); }
  };
  const submitReset = async () => {
    if (!otp.trim() || password.length < 8 || password !== confirmPassword) { Alert.alert('Kiểm tra thông tin', 'Nhập mã xác minh, mật khẩu mới tối thiểu 8 ký tự và xác nhận chính xác.'); return; }
    setBusy(true);
    try { await apiRequest('/api/v1/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: email.trim(), otp: otp.trim(), newPassword: password }) }); setMode('login'); setPassword(''); setConfirmPassword(''); setOtp(''); setNotice('Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.'); }
    catch (error) { notifyError(error, 'Đặt lại mật khẩu thất bại'); }
    finally { setBusy(false); }
  };
  const submitLogin = async () => {
    if (!email.trim() || !password) { Alert.alert('Thiếu thông tin', 'Nhập địa chỉ thư điện tử hoặc tên đăng nhập cùng mật khẩu.'); return; }
    setBusy(true);
    try { await signIn(email, password); }
    catch (error) { notifyError(error, 'Không thể đăng nhập'); }
    finally { setBusy(false); }
  };
  const introDescription = mode === 'login'
    ? 'Không gian đọc và quản lý thư viện dành cho cộng đồng FPT.'
    : mode.startsWith('register')
      ? 'Tạo tài khoản thư viện và gửi hồ sơ để thủ thư xét duyệt.'
      : mode === 'pending'
        ? 'Hồ sơ của bạn đang được thủ thư xem xét.'
        : 'Lấy lại quyền truy cập tài khoản thư viện của bạn.';
  const primary = (label: string, action: () => void) => <Pressable disabled={busy} onPress={action} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{label}</Text>}</Pressable>;
  const nav = (text: string, target: AuthMode) => <Pressable onPress={() => { setMode(target); setNotice(''); }}><Text style={styles.link}>{text}</Text></Pressable>;

  if (mode === 'welcome') return <SafeAreaView style={styles.welcomeRoot} edges={['top', 'bottom']}>
    <View style={styles.welcomeGlowTop} /><View style={styles.welcomeGlowBottom} />
    <View style={styles.welcomeContent}>
      <View style={styles.welcomeLogoFrame}><Image source={logo} resizeMode="contain" style={styles.welcomeLogo} /></View>
      <Text style={styles.welcomeEyebrow}>ĐẠI HỌC FPT · SMARTLIBRARY</Text>
      <Text style={styles.welcomeTitle}>Tri thức{ '\n' }trong tầm tay.</Text>
      <Text style={styles.welcomeDescription}>Khám phá không gian đọc và quản lý thư viện dành cho cộng đồng FPT.</Text>
      <View style={styles.welcomeActions}>
        <Pressable onPress={() => { setNotice(''); setMode('register'); }} style={({ pressed }) => [styles.gradientButton, pressed && styles.pressed]}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs><SvgLinearGradient id="signupGradient" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#f36b19" /><Stop offset="0.52" stopColor="#ffad2b" /><Stop offset="1" stopColor="#ffd83f" /></SvgLinearGradient></Defs>
            <Rect x="0" y="0" width="100%" height="100%" rx="27" fill="url(#signupGradient)" />
          </Svg>
          <Text style={styles.gradientButtonText}>Đăng ký</Text>
        </Pressable>
        <Pressable onPress={() => { setNotice(''); setMode('login'); }} style={({ pressed }) => [styles.fptLoginButton, pressed && styles.pressed]}>
          <Text style={styles.fptLoginText}>Đăng nhập bằng tài khoản FPTU</Text>
        </Pressable>
      </View>
    </View>
  </SafeAreaView>;

  return <SafeAreaView style={styles.root} edges={['top', 'bottom']}><View pointerEvents="none" style={styles.welcomeGlowTop} /><View pointerEvents="none" style={styles.welcomeGlowBottom} /><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, mode === 'login' && styles.loginContent]}>
      <Pressable onPress={() => setMode('welcome')} style={styles.backLink}><Text style={styles.backLinkText}>‹  Quay lại</Text></Pressable>
      <View style={styles.authIntro}>
        <Image source={logo} resizeMode="contain" style={[styles.authIntroLogo, mode === 'login' && styles.loginIntroLogo]} />
        <Text style={styles.welcomeEyebrow}>ĐẠI HỌC FPT · SMARTLIBRARY</Text>
        <Text style={styles.welcomeDescription}>{introDescription}</Text>
      </View>
      <View style={styles.form}>
        {mode === 'login' && <>
          <Text style={styles.heading}>Đăng nhập</Text><Text style={styles.hint}>Dùng tài khoản thư viện của bạn</Text>
          <Field label="THƯ ĐIỆN TỬ / TÊN ĐĂNG NHẬP / MÃ BẠN ĐỌC" value={email} onChangeText={setEmail} placeholder="ten@fpt.edu.vn" keyboardType="email-address" autoCapitalize="none" />
          <View style={styles.labelRow}><Text style={styles.label}>MẬT KHẨU</Text><Link title="Quên mật khẩu?" onPress={() => setMode('forgot')} /></View>
          <View style={styles.passwordBox}><TextInput value={password} onChangeText={setPassword} placeholder="Nhập mật khẩu" placeholderTextColor="#929e95" secureTextEntry={!showPassword} autoCapitalize="none" style={styles.passwordInput} onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 220)} onSubmitEditing={() => void submitLogin()} returnKeyType="go" /><Pressable onPress={() => setShowPassword((value) => !value)}><Text style={styles.link}>{showPassword ? 'Ẩn' : 'Hiện'}</Text></Pressable></View>
          {primary('Đăng nhập', () => void submitLogin())}
          <View style={styles.bottomLinks}><Text style={styles.note}>Chưa có tài khoản? </Text>{nav('Đăng ký bạn đọc', 'register')}</View>
        </>}
        {mode === 'register' && <>
          <Text style={styles.heading}>Tạo tài khoản bạn đọc</Text><Text style={styles.hint}>Thông tin hồ sơ sẽ được thủ thư duyệt</Text>
          <Field label="HỌ VÀ TÊN" value={fullName} onChangeText={setFullName} placeholder="Nguyễn Văn An" />
          <Field label="ĐỊA CHỈ THƯ ĐIỆN TỬ" value={email} onChangeText={setEmail} placeholder="ten@fpt.edu.vn" keyboardType="email-address" autoCapitalize="none" />
          <Field label="SỐ ĐIỆN THOẠI" value={phone} onChangeText={setPhone} placeholder="0912345678" keyboardType="phone-pad" />
          <Field label="ĐỊA CHỈ" value={address} onChangeText={setAddress} placeholder="Địa chỉ liên hệ" />
          <Field label="NGÀY SINH (NĂM-THÁNG-NGÀY)" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="2000-01-31" />
          <Field label="MẬT KHẨU (TỐI THIỂU 8 KÝ TỰ)" value={password} onChangeText={setPassword} placeholder="Tạo mật khẩu" secureTextEntry={!showPassword} autoCapitalize="none" />
          <Field label="XÁC NHẬN MẬT KHẨU" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Nhập lại mật khẩu" secureTextEntry={!showPassword} autoCapitalize="none" />
          {primary('Gửi mã xác minh thư điện tử', () => void sendRegistrationOtp())}<View style={styles.bottomLinks}>{nav('Quay lại đăng nhập', 'login')}</View>
        </>}
        {mode === 'registerOtp' && <>
          <Text style={styles.heading}>Xác minh thư điện tử</Text><Text style={styles.hint}>{notice || `Nhập mã xác minh gồm 6 chữ số đã gửi đến ${email}`}</Text>
          <Field label="MÃ XÁC MINH" value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="numeric" autoCapitalize="none" />
          {primary('Xác minh', () => void verifyRegistrationOtp())}<View style={styles.bottomLinks}><Link title="Gửi lại mã" onPress={() => { setMode('register'); void sendRegistrationOtp(); }} /><Text style={styles.separator}> · </Text><Link title="Sửa thông tin" onPress={() => setMode('register')} /></View>
        </>}
        {mode === 'registerDocs' && <>
          <Text style={styles.heading}>Tải giấy tờ xác minh</Text><Text style={styles.hint}>{notice}</Text>
          <Text style={styles.label}>LOẠI GIẤY TỜ</Text><View style={styles.choiceRow}>{(['NationalId', 'StudentCard', 'DriverLicense'] as const).map((kind) => <Pressable key={kind} onPress={() => setDocumentType(kind)} style={[styles.choice, documentType === kind && styles.choiceActive]}><Text style={[styles.choiceText, documentType === kind && styles.choiceTextActive]}>{kind === 'NationalId' ? 'CCCD' : kind === 'StudentCard' ? 'Thẻ SV' : 'GPLX'}</Text></Pressable>)}</View>
          {([['front', 'Ảnh mặt trước', front], ['back', documentType === 'NationalId' ? 'Ảnh mặt sau (bắt buộc)' : 'Ảnh mặt sau (nếu có)', back], ['selfie', 'Ảnh chân dung (tùy chọn)', selfie]] as const).map(([kind, label, asset]) => <Pressable key={kind} onPress={() => void pickImage(kind)} style={styles.upload}><View style={styles.uploadPreview}>{asset ? <Image source={{ uri: asset.uri }} style={styles.preview} /> : <Text style={styles.uploadPlus}>+</Text>}</View><View style={styles.uploadCopy}><Text style={styles.uploadTitle}>{label}</Text><Text style={styles.uploadHint}>{asset ? asset.fileName || 'Đã chọn ảnh' : 'Chạm để chọn từ thư viện ảnh'}</Text></View><Text style={styles.link}>{asset ? 'Đổi' : 'Chọn'}</Text></Pressable>)}
          {primary('Gửi hồ sơ đăng ký', () => void submitRegistration())}<View style={styles.bottomLinks}><Link title="Quay lại mã xác minh" onPress={() => setMode('registerOtp')} /></View>
        </>}
        {mode === 'forgot' && <>
          <Text style={styles.heading}>Quên mật khẩu</Text><Text style={styles.hint}>Nhập địa chỉ thư điện tử để nhận mã khôi phục tài khoản.</Text><Field label="ĐỊA CHỈ THƯ ĐIỆN TỬ" value={email} onChangeText={setEmail} placeholder="ten@fpt.edu.vn" keyboardType="email-address" autoCapitalize="none" />
          {primary('Gửi hướng dẫn khôi phục', () => void submitForgot())}<View style={styles.bottomLinks}>{nav('Quay lại đăng nhập', 'login')}</View>
        </>}
        {mode === 'reset' && <>
          <Text style={styles.heading}>Đặt lại mật khẩu</Text><Text style={styles.hint}>{notice || 'Nhập mã xác minh trong thư điện tử và tạo mật khẩu mới.'}</Text>
          <Field label="ĐỊA CHỈ THƯ ĐIỆN TỬ" value={email} onChangeText={setEmail} placeholder="ten@fpt.edu.vn" keyboardType="email-address" autoCapitalize="none" /><Field label="MÃ XÁC MINH" value={otp} onChangeText={setOtp} placeholder="Mã trong thư điện tử" keyboardType="numeric" autoCapitalize="none" />
          <Field label="MẬT KHẨU MỚI" value={password} onChangeText={setPassword} placeholder="Ít nhất 8 ký tự" secureTextEntry={!showPassword} autoCapitalize="none" /><Field label="XÁC NHẬN MẬT KHẨU" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Nhập lại mật khẩu mới" secureTextEntry={!showPassword} autoCapitalize="none" />
          {primary('Cập nhật mật khẩu', () => void submitReset())}<View style={styles.bottomLinks}><Link title="Gửi lại hướng dẫn" onPress={() => { setMode('forgot'); void submitForgot(); }} /></View>
        </>}
        {mode === 'pending' && <><Text style={styles.heading}>Đang chờ phê duyệt</Text><Text style={styles.hint}>{notice}</Text>{primary('Về đăng nhập', startLogin)}</>}
        {!!notice && mode !== 'registerOtp' && mode !== 'registerDocs' && mode !== 'reset' && mode !== 'pending' && <Text style={styles.notice}>{notice}</Text>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  welcomeRoot: { flex: 1, backgroundColor: '#f5f7f2', overflow: 'hidden' }, welcomeContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, paddingTop: 20, paddingBottom: 18 },
  welcomeGlowTop: { position: 'absolute', top: -250, left: -170, width: 620, height: 850, borderRadius: 420, backgroundColor: '#f4dfc1', opacity: 0.9 }, welcomeGlowBottom: { position: 'absolute', top: 50, right: -260, width: 500, height: 1000, borderRadius: 350, backgroundColor: '#e7edde', opacity: 0.9 },
  welcomeLogoFrame: { width: 230, height: 230, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, welcomeLogo: { width: 218, height: 218 }, welcomeEyebrow: { color: COLORS.green, fontSize: 10, letterSpacing: 2.1, fontWeight: '800', textAlign: 'center' }, welcomeTitle: { color: '#17261d', fontSize: 35, lineHeight: 42, fontWeight: '700', letterSpacing: -1.1, textAlign: 'center', marginTop: 14 }, welcomeDescription: { color: '#68736a', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12, maxWidth: 330 },
  welcomeActions: { width: '100%', maxWidth: 370, gap: 11, marginTop: 34 }, gradientButton: { height: 54, borderRadius: 28, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, gradientButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' }, fptLoginButton: { height: 53, borderRadius: 28, borderWidth: 1, borderColor: '#c8cec6', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, fptLoginText: { color: '#26342a', fontSize: 14, fontWeight: '600' }, backLink: { paddingHorizontal: 4, paddingVertical: 7, alignSelf: 'flex-start', marginBottom: 5 }, backLinkText: { color: COLORS.green, fontSize: 13, fontWeight: '700' },
  flex: { flex: 1 }, root: { flex: 1, backgroundColor: COLORS.background, overflow: 'hidden' }, content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 22 }, loginContent: { paddingTop: 3, paddingBottom: 5 }, authIntro: { alignItems: 'center', paddingHorizontal: 5, paddingTop: 2, paddingBottom: 12 }, authIntroLogo: { width: 150, height: 150, marginBottom: 3 }, loginIntroLogo: { width: 118, height: 118, marginBottom: 1 },
  form: { paddingHorizontal: 5, paddingTop: 7 }, heading: { color: COLORS.ink, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 }, hint: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 12 }, fieldWrap: { marginBottom: 10 }, label: { color: '#69766d', fontSize: 9, letterSpacing: 1.1, fontWeight: '800', marginBottom: 6 }, input: { minHeight: 49, borderRadius: 14, borderWidth: 1, borderColor: '#e5dfd1', backgroundColor: COLORS.surface, paddingHorizontal: 15, color: COLORS.ink, fontSize: 14 }, multiline: { minHeight: 76, paddingTop: 12 }, labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }, passwordBox: { height: 49, borderRadius: 14, borderWidth: 1, borderColor: '#e5dfd1', backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 12 }, passwordInput: { flex: 1, color: COLORS.ink, fontSize: 14 },
  primary: { minHeight: 50, borderRadius: 15, backgroundColor: '#ee922e', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 5 }, primaryText: { color: '#24170c', fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.65 }, pressed: { opacity: 0.82 }, link: { color: '#b85c16', fontWeight: '700', fontSize: 12 }, bottomLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, minHeight: 22 }, note: { color: COLORS.muted, fontSize: 12 }, separator: { color: COLORS.muted }, roleNote: { textAlign: 'center', color: COLORS.muted, fontSize: 11, marginTop: 16 }, notice: { color: '#88400b', backgroundColor: '#fff0d8', fontSize: 12, lineHeight: 18, padding: 12, borderRadius: 12, marginTop: 13 },
  choiceRow: { flexDirection: 'row', gap: 8, marginBottom: 16 }, choice: { borderWidth: 1, borderColor: '#e5dfd1', backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 }, choiceActive: { borderColor: '#ee922e', backgroundColor: '#fff0d8' }, choiceText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' }, choiceTextActive: { color: '#88400b', fontWeight: '800' }, upload: { minHeight: 73, backgroundColor: COLORS.surface, borderColor: '#e5dfd1', borderWidth: 1, borderRadius: 14, marginBottom: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 }, uploadPreview: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#fff0d8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, preview: { width: '100%', height: '100%' }, uploadPlus: { color: '#b85c16', fontSize: 26, fontWeight: '300' }, uploadCopy: { flex: 1 }, uploadTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '700' }, uploadHint: { color: COLORS.muted, fontSize: 10, marginTop: 5 },
});
