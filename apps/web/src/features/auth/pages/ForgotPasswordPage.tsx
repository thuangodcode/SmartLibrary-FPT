import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, ArrowRight, CheckCircle2, RotateCcw, ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { forgotPasswordSchema, type ForgotPasswordInput } from '../schemas/authSchemas';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';

export const ForgotPasswordPage: React.FC = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const sendResetEmail = async (email: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await parseApiResponse<{ success?: boolean; error?: string }>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không thể gửi yêu cầu khôi phục mật khẩu.');
      }
      setSubmittedEmail(email);
      setIsSubmitted(true);
      setResendCountdown(60);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể gửi yêu cầu khôi phục mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async ({ email }: ForgotPasswordInput) => {
    await sendResetEmail(email);
  };

  const handleResend = async () => {
    if (!submittedEmail || resendCountdown > 0 || isLoading) return;
    await sendResetEmail(submittedEmail);
  };

  return (
    <AuthLayout
      variant="design"
      title="Quên Mật Khẩu"
      subtitle="Nhập email tài khoản của bạn để nhận liên kết và mã xác thực đặt lại mật khẩu an toàn."
    >
      {errorMessage && (
        <div className="auth-error mb-4" role="alert">
          {errorMessage}
        </div>
      )}

      {isSubmitted ? (
        <div className="space-y-6 pt-2">
          <div className="p-5 rounded-2xl bg-orange-50/70 border border-orange-100 flex items-start gap-3.5">
            <CheckCircle2 className="w-6 h-6 text-[#df6226] shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700 leading-relaxed space-y-1">
              <p className="font-semibold text-slate-900 text-sm">Đã gửi yêu cầu thành công!</p>
              <p>
                Hướng dẫn đặt lại mật khẩu và mã OTP xác thực đã được gửi đến:
              </p>
              <p className="font-bold text-[#df6226] text-sm break-all">{submittedEmail}</p>
              <p className="text-[11px] text-slate-500 pt-1">
                Vui lòng kiểm tra hộp thư đến hoặc mục <strong>Thư rác / Spam</strong>.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate(`/reset-password?email=${encodeURIComponent(submittedEmail)}`)}
              className="auth-submit w-full flex items-center justify-center gap-2"
            >
              <span>Nhập Mã OTP Đặt Lại Mật Khẩu</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between text-xs px-1 pt-1">
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Đổi email khác
              </button>

              <button
                type="button"
                disabled={resendCountdown > 0 || isLoading}
                onClick={handleResend}
                className="text-[#df6226] font-semibold hover:underline disabled:text-slate-400 disabled:no-underline flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {resendCountdown > 0 ? `Gửi lại sau (${resendCountdown}s)` : 'Gửi lại email'}
              </button>
            </div>
          </div>

          <div className="auth-footer-prompt text-center pt-3 border-t border-slate-100">
            <Link to="/login" className="auth-footer-link inline-flex items-center gap-1.5 font-semibold text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Quay lại trang Đăng nhập
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          <div className="auth-field">
            <label htmlFor="forgot-email" className="auth-label">
              Địa chỉ Email đăng ký tài khoản
            </label>
            <div className="relative">
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                {...register('email')}
                placeholder="example@fpt.edu.vn hoặc example@gmail.com"
                className="auth-input pl-10"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {errors.email && (
              <p className="text-xs text-rose-600 mt-1">{errors.email.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="auth-submit w-full flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang gửi email...</span>
              </>
            ) : (
              <>
                <span>Gửi Yêu Cầu Khôi Phục</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="auth-footer-prompt text-center pt-2">
            <span className="text-slate-500 text-xs">Nhớ lại mật khẩu? </span>
            <Link to="/login" className="auth-footer-link font-semibold text-xs">
              Đăng nhập ngay
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
