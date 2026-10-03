import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, ArrowRight } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { resetPasswordSchema, type ResetPasswordInput } from '../schemas/authSchemas';
import { useNavigate } from 'react-router-dom';

export const ResetPasswordPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async () => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      navigate('/login?resetSuccess=true');
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

        <button
          type="submit"
          disabled={isLoading}
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
