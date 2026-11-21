import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const redirectUri = 'smartlibrary://google-auth';
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// PKCE keeps the verifier in memory and sends only its SHA-256 challenge to the browser.
export async function googleSignIn() {
  if (!supabaseUrl || !anonKey) throw new Error('Chưa cấu hình đăng nhập Google cho ứng dụng.');
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) throw new Error('Đăng nhập Google cần bản development build hoặc bản cài đặt; Expo Go không hỗ trợ callback này.');
  const bytes = await Crypto.getRandomBytesAsync(32);
  const verifier = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  const challenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const params = new URLSearchParams({ provider: 'google', redirect_to: redirectUri, code_challenge: challenge, code_challenge_method: 's256' });
  const result = await WebBrowser.openAuthSessionAsync(`${supabaseUrl}/auth/v1/authorize?${params}`, redirectUri);
  if (result.type === 'cancel' || result.type === 'dismiss') return null;
  if (result.type !== 'success' || !result.url.startsWith(`${redirectUri}?`)) throw new Error('Không nhận được phản hồi đăng nhập hợp lệ.');
  const query = new URL(result.url).searchParams;
  const code = query.get('code');
  if (!code) throw new Error(query.get('error_description') || 'Không nhận được mã đăng nhập Google.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    const session = await response.json();
    if (!response.ok || !session.access_token || !session.refresh_token || !session.user?.email) throw new Error('Không thể hoàn tất phiên đăng nhập Google.');
    return { accessToken: session.access_token as string, refreshToken: session.refresh_token as string, email: session.user.email as string,
      fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
      avatarUrl: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture };
  } catch {
    throw new Error('Không thể hoàn tất phiên đăng nhập Google. Vui lòng thử lại.');
  } finally { clearTimeout(timeout); }
}
