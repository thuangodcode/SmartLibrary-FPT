import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { forgotPasswordSchema, type ForgotPasswordInput } from '../schemas/authSchemas';

export const ForgotPasswordPage: React.FC = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async () => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Quên Mật Khẩu?"
      subtitle="Nhập email của bạn để nhận liên kết khôi phục mật khẩu bảo mật"
    >
      {isSubmitted ? (
        <div className="text-center py-6 space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">Đã gửi yêu cầu khôi phục</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Nếu email của bạn tồn tại trên hệ thống, một hướng dẫn đặt lại mật khẩu đã được gửi đến hộp thư.
          </p>
          <div className="pt-4">
            <a href="/login" className="text-xs font-bold text-indigo-600 hover:underline">
              &larr; Quay lại Đăng nhập
            </a>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Địa chỉ Email đăng ký
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                {...register('email')}
                placeholder="vinhnt@fpt.edu.vn"
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs sm:text-sm focus:outline-none focus:border-indigo-600"
              />
            </div>
            {errors.email && (
              <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.email.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-2xl bg-slate-900 dark:bg-indigo-600 text-white font-semibold text-xs sm:text-sm shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span>Đang gửi yêu cầu...</span>
            ) : (
              <>
                <span>Gửi Liên Kết Khôi Phục</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="text-center pt-2">
            <a href="/login" className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:underline">
              &larr; Quay lại Đăng nhập
            </a>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
