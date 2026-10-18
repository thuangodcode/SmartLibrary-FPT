import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { resetPasswordSchema, type ResetPasswordInput } from '../schemas/authSchemas';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';

export const ResetPasswordPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const token = new URLSearchParams(window.location.hash.slice(1)).get('access_token');
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async ({ password }: ResetPasswordInput) => {
    if (!token) {
      setRequestError('Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu email mới.');
      return;
    }

    setIsLoading(true);
    setRequestError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const result = await parseApiResponse<{ success?: boolean; error?: string }>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không thể cập nhật mật khẩu.');
      }
      navigate('/login?resetSuccess=true');
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Không thể cập nhật mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Đặt Mật Khẩu Mới"
      subtitle="Nhập mật khẩu mới cho tài khoản SmartLibrary của bạn"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {!token && (
          <p className="flex items-start gap-2 text-[11px] text-rose-500 font-medium" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu email mới.
          </p>
        )}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Mật khẩu mới
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              {...register('password')}
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm focus:outline-none focus:border-indigo-600"
            />
          </div>
          {errors.password && (
            <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
            Xác nhận mật khẩu mới
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              {...register('confirmPassword')}
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm focus:outline-none focus:border-indigo-600"
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.confirmPassword.message}</p>
          )}
        </div>

        {requestError && token && <p className="text-[11px] text-rose-500 font-medium" role="alert">{requestError}</p>}

        <button
          type="submit"
          disabled={isLoading || !token}
          className="w-full py-3.5 rounded-2xl bg-slate-900 dark:bg-indigo-600 text-white font-semibold text-xs sm:text-sm shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <span>Đang cập nhật...</span>
          ) : (
            <>
              <span>Cập Nhật Mật Khẩu</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
};

export default ResetPasswordPage;
