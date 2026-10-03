import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { loginSchema, type LoginInput } from '../schemas/authSchemas';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('http://localhost:5278/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        setErrorMessage(resData.error || 'Email hoặc mật khẩu không đúng. Vui lòng thử lại.');
        return;
      }

      const user = resData.data.user;
      const role = user?.role || 'Reader';

      setAuth(
        {
          id: user?.id || '',
          email: user?.email || data.email,
          fullName: user?.fullName || 'Người dùng',
          avatarUrl: user?.avatarUrl || null,
          role: role,
          status: user?.status || 'Active',
        },
        resData.data.accessToken,
        user?.permissions || []
      );

      // Role-based redirect
      if (redirect) {
        navigate(redirect);
      } else if (role === 'Admin') {
        navigate('/admin');
      } else if (role === 'Librarian') {
        navigate('/librarian');
      } else {
        navigate('/');
      }
    } catch {
      setErrorMessage('Không thể kết nối với Backend API. Vui lòng kiểm tra lại dịch vụ Backend.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Đăng Nhập SmartLibrary"
      subtitle="Nhập email và mật khẩu của bạn để truy cập thư viện số"
    >
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
          ⚠️ {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            Địa chỉ Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              {...register('email')}
              placeholder="vinhnt@fpt.edu.vn"
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-600 transition-colors"
            />
          </div>
          {errors.email && (
            <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.email.message}</p>
          )}
        </div>

        {/* Password Input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Mật khẩu
            </label>
            <a
              href="/forgot-password"
              className="text-[11px] font-semibold text-indigo-600 hover:underline"
            >
              Quên mật khẩu?
            </a>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              placeholder="••••••••"
              className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-600 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.password.message}</p>
          )}
        </div>

        {/* Remember me checkbox */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="rememberMe"
            {...register('rememberMe')}
            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="rememberMe" className="text-xs text-slate-600 dark:text-slate-400">
            Ghi nhớ đăng nhập
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 rounded-2xl bg-slate-900 dark:bg-indigo-600 text-white font-semibold text-xs sm:text-sm shadow-xl hover:bg-slate-800 dark:hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isLoading ? (
            <span>Đang đăng nhập...</span>
          ) : (
            <>
              <span>Đăng Nhập</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="text-center pt-2">
        <p className="text-xs text-slate-500">
          Chưa có tài khoản?{' '}
          <a href="/register" className="font-bold text-indigo-600 hover:underline">
            Đăng ký ngay
          </a>
        </p>
      </div>
    </AuthLayout>
  );
};

export default LoginPage;
