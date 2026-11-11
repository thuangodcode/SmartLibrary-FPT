import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { loginSchema, type LoginInput } from '../schemas/authSchemas';
import { useAuthStore } from '../store/useAuthStore';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { parseApiResponse } from '../../../lib/api';
import { API_BASE_URL } from '../../../config';
import { useToast } from '../../../components/ui/useToast';

export const LoginPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const setAuth = useAuthStore((state) => state.setAuth);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  React.useEffect(() => {
    if (isAuthenticated && user) {
      if (user.role === 'Admin') navigate('/admin');
      else if (user.role === 'Librarian') navigate('/librarian');
      else navigate('/');
    }
  }, [isAuthenticated, user, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      const resData = await parseApiResponse<{ success?: boolean; error?: string; meta?: { code?: string }; data?: { user?: { id?: string; email?: string; fullName?: string; avatarUrl?: string | null; role?: string; status?: string; permissions?: string[] }; accessToken?: string } }>(response);
      if (!response.ok || !resData?.success) {
        const fallbackMessage = response.status === 503
          ? 'Dịch vụ đăng nhập đang tạm thời không khả dụng. Vui lòng thử lại sau.'
          : response.status === 429
            ? 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ rồi thử lại.'
            : 'Email hoặc mật khẩu không đúng. Vui lòng thử lại.';
        const message = resData?.error || fallbackMessage;
        showToast({ type: 'error', title: 'Đăng nhập thất bại', message });
        return;
      }

      const user = resData.data?.user;
      const role = user?.role;
      const accessToken = resData.data?.accessToken;
      if (
        !user?.id ||
        !accessToken ||
        user.status !== 'Active' ||
        (role !== 'Admin' && role !== 'Librarian' && role !== 'Reader')
      ) {
        const message = 'Tài khoản chưa được xác thực hoặc chưa được cấp quyền hợp lệ.';
        showToast({ type: 'error', title: 'Không thể đăng nhập', message });
        return;
      }

      setAuth(
        {
          id: user?.id || '',
          email: user?.email || data.email,
          fullName: user?.fullName || 'Người dùng',
          avatarUrl: user?.avatarUrl ?? undefined,
          role,
          status: user?.status || 'Active',
        },
        accessToken,
        user?.permissions || []
      );
      showToast({
        type: 'success',
        title: 'Đăng nhập thành công',
        message: user.email?.toLowerCase().endsWith('@smartlibrary.local')
          ? `Xin chào ${user.fullName || 'bạn'}! Bạn có thể xác minh email cá nhân trong Hồ sơ bất cứ lúc nào.`
          : `Xin chào ${user.fullName || 'bạn'}!`,
      });

      if (role === 'Reader' && user.email?.toLowerCase().endsWith('@smartlibrary.local')) {
        navigate('/profile');
        return;
      }

      // Role-based redirect
      if (role === 'Admin') {
        navigate(redirect?.startsWith('/admin') ? redirect : '/admin');
      } else if (role === 'Librarian') {
        navigate(redirect?.startsWith('/librarian') ? redirect : '/librarian');
      } else {
        navigate(redirect && !redirect.startsWith('/admin') && !redirect.startsWith('/librarian') ? redirect : '/');
      }
    } catch {
      const message = 'Không thể kết nối với Backend API. Vui lòng kiểm tra lại dịch vụ Backend.';
      showToast({ type: 'error', title: 'Lỗi kết nối', message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      variant="design"
      title="Đăng nhập"
      subtitle="Chào mừng trở lại. Những cuốn sách hay đang chờ bạn."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
        <div className="auth-field">
          <label htmlFor="login-email" className="auth-label">Email, tên đăng nhập hoặc mã sinh viên</label>
          <input
            id="login-email"
            type="text"
            autoComplete="username"
            {...register('email')}
            placeholder="Mã số sinh viên hoặc email của bạn"
            className="auth-input"
          />
          {errors.email && (
            <p className="text-xs text-rose-600">{errors.email.message}</p>
          )}
        </div>

        <div className="auth-field">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="auth-label">Mật khẩu</label>
            <Link to="/forgot-password" className="text-xs font-semibold">
              Quên mật khẩu?
            </Link>
          </div>
          <div className="auth-password-field">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              {...register('password')}
              placeholder="••••••••"
              className="auth-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="auth-password-toggle"
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-rose-600">{errors.password.message}</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            id="rememberMe"
            {...register('rememberMe')}
            className="auth-checkbox h-4 w-4 rounded"
          />
          Ghi nhớ đăng nhập
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="auth-primary-button"
        >
          {isLoading ? (
            <span>Đang đăng nhập...</span>
          ) : (
            <>
              <ArrowRight size={16} />
              <span>Đăng nhập</span>
            </>
          )}
        </button>
      </form>

      <div className="auth-security-note">
        <ShieldCheck size={17} />
        <div>
          <strong>Đăng nhập an toàn</strong>
          <p>Không chia sẻ mật khẩu. Chỉ ghi nhớ đăng nhập trên thiết bị cá nhân.</p>
        </div>
      </div>

      <div className="pt-5 text-xs">
        <p className="text-slate-500">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-semibold">Đăng ký tài khoản →</Link>
        </p>
      </div>
    </AuthLayout>
  );
};

export default LoginPage;
