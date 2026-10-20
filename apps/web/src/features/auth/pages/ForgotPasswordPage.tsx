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
      title="Khôi phục mật khẩu"
      subtitle="Nhập email đã đăng ký. Chúng tôi sẽ gửi hướng dẫn để bạn tạo mật khẩu mới."
    >
      {errorMessage && (
        <div className="auth-error password-recovery-error" role="alert">
          {errorMessage}
        </div>
      )}

      {isSubmitted ? (
        <div className="password-recovery-success">
          <div className="password-recovery-success-card">
            <div className="password-recovery-success-icon">
              <CheckCircle2 aria-hidden="true" />
            </div>
            <div className="password-recovery-success-copy">
              <h2>Kiểm tra hộp thư của bạn</h2>
              <p>Hướng dẫn đặt lại mật khẩu và mã xác thực đã được gửi đến:</p>
              <strong>{submittedEmail}</strong>
              <p className="password-recovery-help">
                Nếu chưa thấy email, hãy kiểm tra mục Thư rác (Spam).
              </p>
            </div>
          </div>

          <div className="password-recovery-actions">
            <button
              type="button"
              onClick={() => navigate(`/reset-password?email=${encodeURIComponent(submittedEmail)}`)}
              className="auth-submit password-reset-submit"
            >
              <span>Nhập mã xác thực</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="password-recovery-secondary-actions">
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="password-recovery-text-button"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Dùng email khác
              </button>

              <button
                type="button"
                disabled={resendCountdown > 0 || isLoading}
                onClick={handleResend}
                className="password-recovery-text-button password-recovery-resend"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {resendCountdown > 0 ? `Gửi lại sau (${resendCountdown}s)` : 'Gửi lại email'}
              </button>
            </div>
          </div>

          <div className="auth-footer-prompt password-recovery-footer">
            <Link to="/login" className="auth-footer-link inline-flex items-center gap-1.5 font-semibold text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Quay lại đăng nhập
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="auth-form password-recovery-form">
          <div className="auth-field password-recovery-field">
            <label htmlFor="forgot-email" className="auth-label">
              Email tài khoản
            </label>
            <div className="relative">
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                {...register('email')}
                placeholder="name@example.com"
                className="auth-input password-recovery-input auth-icon-input"
                aria-invalid={Boolean(errors.email)}
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
            className="auth-submit password-reset-submit"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang gửi email...</span>
              </>
            ) : (
              <>
                <span>Gửi hướng dẫn khôi phục</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="auth-footer-prompt password-recovery-footer">
            <span className="text-slate-500 text-xs">Bạn đã nhớ mật khẩu? </span>
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
