import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, CheckCircle2, ArrowLeft, Loader2, KeyRound, Mail } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { resetPasswordSchema, type ResetPasswordInput } from '../schemas/authSchemas';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL parameters (from email link or redirect)
  const tokenFromUrl = searchParams.get('token') || '';
  const emailFromUrl = searchParams.get('email') || '';
  const hashToken = new URLSearchParams(window.location.hash.slice(1)).get('access_token');
  const activeToken = tokenFromUrl || hashToken || '';

  const [emailValue, setEmailValue] = useState(emailFromUrl);
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: emailFromUrl,
      otp: '',
      password: '',
      confirmPassword: '',
    },
  });

  const watchPassword = watch('password', '');

  useEffect(() => {
    if (emailFromUrl) {
      setValue('email', emailFromUrl);
      setEmailValue(emailFromUrl);
    }
  }, [emailFromUrl, setValue]);

  // Real-time password criteria
  const passwordCriteria = [
    { label: 'Tối thiểu 8 ký tự', met: watchPassword.length >= 8 },
    { label: 'Chữ in hoa (A-Z)', met: /[A-Z]/.test(watchPassword) },
    { label: 'Chữ thường (a-z)', met: /[a-z]/.test(watchPassword) },
    { label: 'Chữ số (0-9)', met: /[0-9]/.test(watchPassword) },
    { label: 'Ký tự đặc biệt (!@#$%...)', met: /[^a-zA-Z0-9]/.test(watchPassword) },
  ];

  const onSubmit = async (data: ResetPasswordInput) => {
    setErrorMessage(null);

    const emailToSend = data.email || emailValue;
    if (!activeToken && (!emailToSend || !data.otp)) {
      setErrorMessage('Vui lòng nhập đầy đủ địa chỉ Email và Mã xác thực OTP đã nhận.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailToSend,
          token: activeToken || null,
          otp: data.otp || otpCode || null,
          newPassword: data.password,
        }),
      });

      const result = await parseApiResponse<{ success?: boolean; error?: string }>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không thể cập nhật mật khẩu. Mã OTP hoặc token có thể đã hết hạn.');
      }

      setIsSuccess(true);
      setTimeout(() => {
        navigate('/login?resetSuccess=true');
      }, 3000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Không thể cập nhật mật khẩu.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      variant="design"
      title="Đặt Lại Mật Khẩu"
      subtitle={
        activeToken
          ? 'Xác thực bảo mật thành công qua liên kết email. Vui lòng tạo mật khẩu mới cho tài khoản.'
          : 'Nhập email, mã xác thực OTP nhận từ thư và thiết lập mật khẩu mới.'
      }
    >
      {errorMessage && (
        <div className="auth-error mb-4" role="alert">
          {errorMessage}
        </div>
      )}

      {isSuccess ? (
        <div className="space-y-6 pt-4 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Đặt Lại Mật Khẩu Thành Công!</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Mật khẩu mới của bạn đã được cập nhật an toàn. Đang chuyển hướng bạn đến trang đăng nhập trong giây lát...
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="auth-submit w-full flex items-center justify-center gap-2"
          >
            <span>Đăng Nhập Ngay</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="auth-form">
          {/* Email field if not provided by token link */}
          {!activeToken && (
            <div className="auth-field">
              <label htmlFor="reset-email" className="auth-label">
                Địa chỉ Email
              </label>
              <div className="relative">
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                  value={emailValue}
                  onChange={(e) => {
                    setEmailValue(e.target.value);
                    setValue('email', e.target.value);
                  }}
                  placeholder="example@fpt.edu.vn"
                  className="auth-input pl-10"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              {errors.email && (
                <p className="text-xs text-rose-600 mt-1">{errors.email.message}</p>
              )}
            </div>
          )}

          {/* OTP field if not using token link */}
          {!activeToken && (
            <div className="auth-field">
              <label htmlFor="reset-otp" className="auth-label">
                Mã xác thực OTP (6 chữ số trong email)
              </label>
              <div className="relative">
                <input
                  id="reset-otp"
                  type="text"
                  maxLength={6}
                  inputMode="numeric"
                  {...register('otp')}
                  value={otpCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtpCode(val);
                    setValue('otp', val);
                  }}
                  placeholder="Ví dụ: 123456"
                  className="auth-input pl-10 font-mono tracking-widest text-base"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              {errors.otp && (
                <p className="text-xs text-rose-600 mt-1">{errors.otp.message}</p>
              )}
            </div>
          )}

          {/* New Password */}
          <div className="auth-field">
            <label htmlFor="reset-password" className="auth-label">
              Mật khẩu mới
            </label>
            <div className="auth-password-field">
              <input
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...register('password')}
                placeholder="Nhập mật khẩu mới an toàn..."
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
              <p className="text-xs text-rose-600 mt-1">{errors.password.message}</p>
            )}

            {/* Password Criteria Checklist */}
            <div className="grid grid-cols-2 gap-1.5 pt-2">
              {passwordCriteria.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      item.met ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {item.met ? '✓' : '•'}
                  </span>
                  <span className={item.met ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm Password */}
          <div className="auth-field">
            <label htmlFor="reset-confirm-password" className="auth-label">
              Xác nhận mật khẩu mới
            </label>
            <div className="auth-password-field">
              <input
                id="reset-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...register('confirmPassword')}
                placeholder="Nhập lại mật khẩu mới..."
                className="auth-input"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="auth-password-toggle"
                aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-rose-600 mt-1">{errors.confirmPassword.message}</p>
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
                <span>Đang cập nhật mật khẩu...</span>
              </>
            ) : (
              <>
                <span>Cập Nhật Mật Khẩu</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="auth-footer-prompt text-center pt-2">
            <Link to="/login" className="auth-footer-link inline-flex items-center gap-1.5 font-semibold text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Quay lại Đăng nhập
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

export default ResetPasswordPage;
