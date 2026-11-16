import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, ArrowRight, ShieldCheck, LoaderCircle } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { loginSchema, type LoginInput } from '../schemas/authSchemas';
import { useAuthStore } from '../store/useAuthStore';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { parseApiResponse } from '../../../lib/api';
import { API_BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../config';
import { useToast } from '../../../components/ui/useToast';
import { createClient } from '@supabase/supabase-js';
import googleIcon from '../../../assets/icongoogle.jpg';

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  role: 'Reader' | 'Librarian' | 'Admin';
  status: string;
  permissions?: string[];
  isVerified?: boolean;
  phone?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  studentId?: string | null;
};

export const LoginPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(() => window.location.hash.includes('access_token'));
  const [googleError, setGoogleError] = useState<string | null>(null);
  const setAuth = useAuthStore((state) => state.setAuth);
  const currentUser = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  React.useEffect(() => {
    if (!supabase || !window.location.hash.includes('access_token')) return;
    let active = true;
    void (async () => {
      setGoogleLoading(true);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session?.user.email) throw new Error(error?.message || 'Google kh\u00f4ng tr\u1ea3 v\u1ec1 email h\u1ee3p l\u1ec7.');
        const session = data.session;
        const response = await fetch(`${API_BASE_URL}/api/v1/auth/google/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: session.access_token,
            email: session.user.email,
            fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
            avatarUrl: session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture,
          }),
        });
        const result = await parseApiResponse<{ success?: boolean; error?: string; data?: { user?: AuthUser } }>(response);
        const account = result?.data?.user;
        if (!response.ok || !result?.success || !account) throw new Error(result?.error || 'Kh\u00f4ng th\u1ec3 ho\u00e0n t\u1ea5t \u0111\u0103ng nh\u1eadp Google.');
        if (!active) return;
        setAuth({
          id: account.id,
          email: account.email,
          fullName: account.fullName,
          avatarUrl: account.avatarUrl ?? undefined,
          role: account.role,
          status: account.status,
          phone: account.phone ?? undefined,
          address: account.address ?? undefined,
          dateOfBirth: account.dateOfBirth ?? undefined,
          studentId: account.studentId ?? undefined,
          isVerified: account.isVerified,
        }, session.access_token, account.permissions || []);
        await supabase.auth.signOut();
        window.history.replaceState({}, document.title, window.location.pathname);
        navigate(account.role === 'Admin' ? '/admin' : account.role === 'Librarian' ? '/librarian' : redirect || '/');
      } catch (error) {
        setGoogleError(error instanceof Error ? error.message : 'Kh\u00f4ng th\u1ec3 ho\u00e0n t\u1ea5t \u0111\u0103ng nh\u1eadp Google.');
        await supabase.auth.signOut();
      } finally {
        if (active) setGoogleLoading(false);
      }
    })();
    return () => { active = false; };
  }, [navigate, redirect, setAuth]);

  const onGoogleLogin = async () => {
    if (!supabase) {
      setGoogleError('Ch\u01b0a c\u1ea5u h\u00ecnh Supabase URL, anon key ho\u1eb7c Google provider.');
      return;
    }
    setGoogleError(null);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (error) {
      setGoogleLoading(false);
      setGoogleError(error.message);
    }
  };

  React.useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    if (currentUser.role === 'Admin') navigate(redirect?.startsWith('/admin') ? redirect : '/admin');
    else if (currentUser.role === 'Librarian') navigate(redirect?.startsWith('/librarian') ? redirect : '/librarian');
    else navigate(redirect && !redirect.startsWith('/admin') && !redirect.startsWith('/librarian') ? redirect : '/');
  }, [isAuthenticated, currentUser, navigate, redirect]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      const resData = await parseApiResponse<{
        success?: boolean;
        error?: string;
        data?: { user?: Partial<AuthUser>; accessToken?: string };
      }>(response);
      if (!response.ok || !resData?.success) {
        const fallback = response.status === 503
          ? 'D\u1ecbch v\u1ee5 \u0111\u0103ng nh\u1eadp \u0111ang t\u1ea1m th\u1eddi kh\u00f4ng kh\u1ea3 d\u1ee5ng. Vui l\u00f2ng th\u1eed l\u1ea1i sau.'
          : response.status === 429
            ? 'B\u1ea1n \u0111\u00e3 th\u1eed \u0111\u0103ng nh\u1eadp qu\u00e1 nhi\u1ec1u l\u1ea7n. Vui l\u00f2ng ch\u1edd r\u1ed3i th\u1eed l\u1ea1i.'
            : 'Email ho\u1eb7c m\u1eadt kh\u1ea9u kh\u00f4ng \u0111\u00fang. Vui l\u00f2ng th\u1eed l\u1ea1i.';
        showToast({ type: 'error', title: '\u0110\u0103ng nh\u1eadp th\u1ea5t b\u1ea1i', message: resData?.error || fallback });
        return;
      }
      const account = resData.data?.user;
      const accessToken = resData.data?.accessToken;
      const role = account?.role;
      if (!account?.id || !accessToken || account.status !== 'Active' || !['Admin', 'Librarian', 'Reader'].includes(role || '')) {
        showToast({ type: 'error', title: 'Kh\u00f4ng th\u1ec3 \u0111\u0103ng nh\u1eadp', message: 'T\u00e0i kho\u1ea3n ch\u01b0a \u0111\u01b0\u1ee3c c\u1ea5p quy\u1ec1n h\u1ee3p l\u1ec7.' });
        return;
      }
      setAuth({
        id: account.id,
        email: account.email || data.email,
        fullName: account.fullName || 'Ng\u01b0\u1eddi d\u00f9ng',
        avatarUrl: account.avatarUrl ?? undefined,
        role: role as AuthUser['role'],
        status: account.status || 'Active',
        isVerified: account.isVerified,
        phone: account.phone ?? undefined,
        address: account.address ?? undefined,
        dateOfBirth: account.dateOfBirth ?? undefined,
        studentId: account.studentId ?? undefined,
      }, accessToken, account.permissions || []);
      showToast({
        type: 'success',
        title: '\u0110\u0103ng nh\u1eadp th\u00e0nh c\u00f4ng',
        message: `Xin ch\u00e0o ${account.fullName || 'b\u1ea1n'}!`,
      });
      if (role === 'Admin') navigate(redirect?.startsWith('/admin') ? redirect : '/admin');
      else if (role === 'Librarian') navigate(redirect?.startsWith('/librarian') ? redirect : '/librarian');
      else navigate(redirect && !redirect.startsWith('/admin') && !redirect.startsWith('/librarian') ? redirect : '/');
    } catch {
      showToast({ type: 'error', title: 'L\u1ed7i k\u1ebft n\u1ed1i', message: 'Kh\u00f4ng th\u1ec3 k\u1ebft n\u1ed1i Backend API. Vui l\u00f2ng ki\u1ec3m tra d\u1ecbch v\u1ee5 Backend.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    <AuthLayout variant="design" title="Đăng nhập" subtitle="Chào mừng trở lại. Những cuốn sách hay đang chờ bạn.">
      <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
        <div className="auth-field">
          <label htmlFor="login-email" className="auth-label">Email, tên đăng nhập hoặc mã sinh viên</label>
          <input id="login-email" type="text" autoComplete="username" {...register('email')}
            placeholder="Mã số sinh viên hoặc email của bạn" className="auth-input" />
          {errors.email && <p className="text-sm text-rose-600">{errors.email.message}</p>}
        </div>
        <div className="auth-field">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="auth-label">Mật khẩu</label>
            <Link to="/forgot-password" className="auth-forgot-link">Quên mật khẩu?</Link>
          </div>
          <div className="auth-password-field">
            <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
              {...register('password')} placeholder="••••••••" className="auth-input" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="auth-password-toggle"
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-rose-600">{errors.password.message}</p>}
        </div>
        <label className="auth-remember-row">
          <input type="checkbox" id="rememberMe" {...register('rememberMe')} className="auth-checkbox" />
          Ghi nhớ đăng nhập
        </label>
        <button type="submit" disabled={isLoading} className="auth-primary-button">
          {isLoading ? <span>Đang đăng nhập...</span> : <><ArrowRight size={18} /><span>Đăng nhập</span></>}
        </button>
      </form>
      <div className="auth-google-divider"><span>hoặc tiếp tục với</span></div>
      {googleError && <p className="auth-google-error" role="alert">{googleError}</p>}
      <button type="button" className="auth-google-button" disabled={googleLoading} onClick={() => void onGoogleLogin()}>
        <img className="auth-google-mark" src={googleIcon} alt="" />
        {googleLoading ? 'Đang kết nối Google…' : 'Đăng nhập bằng Google'}
      </button>
      <div className="auth-security-note">
        <ShieldCheck size={18} />
        <div><strong>Đăng nhập an toàn</strong><p>Không chia sẻ mật khẩu. Chỉ ghi nhớ đăng nhập trên thiết bị cá nhân.</p></div>
      </div>
      <div className="auth-register-prompt">
        <span>Chưa có tài khoản?</span>
        <Link to="/register" className="auth-register-link">Đăng ký tài khoản <ArrowRight size={17} /></Link>
      </div>
    </AuthLayout>
    {googleLoading && (
      <div className="auth-transition-overlay" role="status" aria-live="polite">
        <div className="auth-transition-card">
          <LoaderCircle className="auth-transition-spinner" size={38} />
          <strong>Đang đăng nhập bằng Google</strong>
          <span>Đang chuẩn bị thư viện cá nhân của bạn…</span>
        </div>
      </div>
    )}
    </>
  );
};

export default LoginPage;
