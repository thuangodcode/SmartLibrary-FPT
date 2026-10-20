import React, { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, CheckCircle2, ArrowLeft, Loader2, KeyRound, Mail } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { resetPasswordSchema, type ResetPasswordInput } from '../schemas/authSchemas';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useToast } from '../../../components/ui/useToast';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL parameters (from email link or redirect)
  const tokenFromUrl = searchParams.get('token') || '';
  const emailFromUrl = searchParams.get('email') || '';
  const hashToken = new URLSearchParams(window.location.hash.slice(1)).get('access_token');
  const activeToken = tokenFromUrl || hashToken || '';

  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    control,
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

  const emailValue = useWatch({ control, name: 'email', defaultValue: emailFromUrl }) || '';

  useEffect(() => {
    if (emailFromUrl) {
      setValue('email', emailFromUrl);
    }
  }, [emailFromUrl, setValue]);

  const onSubmit = async (data: ResetPasswordInput) => {
    const emailToSend = data.email || emailValue;
    if (!activeToken && (!emailToSend || !data.otp)) {
      showToast({
        type: 'warning',
        title: 'Thiếu thông tin',
        message: 'Vui lòng nhập đầy đủ email và mã xác thực đã nhận.',
      });
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
      showToast({
        type: 'success',
        title: 'Đặt lại mật khẩu thành công',
        message: 'Bạn có thể đăng nhập bằng mật khẩu mới.',
      });
      setTimeout(() => {
        navigate('/login?resetSuccess=true');
      }, 1600);
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Không thể cập nhật mật khẩu',
        message: error instanceof Error ? error.message : 'Không thể cập nhật mật khẩu.',
      });
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
      {isSuccess ? (
        <div className="password-reset-success">
          <div className="password-reset-success-icon">
            <CheckCircle2 aria-hidden="true" />
          </div>
          <div className="password-reset-success-copy">
            <h3>Đặt lại mật khẩu thành công</h3>
            <p>
              Mật khẩu mới đã được cập nhật. Đang chuyển bạn đến trang đăng nhập...
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="auth-submit password-reset-submit"
          >
            <span>Đăng Nhập Ngay</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="auth-form password-recovery-form">
          {/* Email field if not provided by token link */}
          {!activeToken && (
            <div className="auth-field password-recovery-field">
              <label htmlFor="reset-email" className="auth-label">
                Email tài khoản
              </label>
              <div className="relative">
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                  value={emailValue}
                  onChange={(e) => {
                    setValue('email', e.target.value);
                  }}
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
          )}

          {/* OTP field if not using token link */}
          {!activeToken && (
            <div className="auth-field password-recovery-field">
              <label htmlFor="reset-otp" className="auth-label">
                Mã xác thực
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
                  placeholder="Nhập mã 6 chữ số trong email"
                  className="auth-input password-recovery-input auth-icon-input font-mono tracking-widest text-base"
                  aria-describedby="reset-otp-help"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p id="reset-otp-help" className="password-recovery-help">
                Mã xác thực gồm 6 chữ số, được gửi đến email của bạn.
              </p>
              {errors.otp && (
                <p className="text-xs text-rose-600 mt-1">{errors.otp.message}</p>
              )}
            </div>
          )}

          {/* New Password */}
          <div className="auth-field password-recovery-field">
            <label htmlFor="reset-password" className="auth-label">
              Mật khẩu mới
            </label>
            <div className="auth-password-field">
              <input
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...register('password')}
                placeholder="Nhập mật khẩu bạn muốn sử dụng"
                className="auth-input password-recovery-input"
                aria-invalid={Boolean(errors.password)}
                aria-describedby="reset-password-help"
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

            <p id="reset-password-help" className="password-recovery-help">
              Mật khẩu có thể là bất kỳ nội dung nào bạn muốn. Không bắt buộc chữ hoa, chữ số hay ký tự đặc biệt.
            </p>
          </div>

          {/* Confirm Password */}
          <div className="auth-field password-recovery-field">
            <label htmlFor="reset-confirm-password" className="auth-label">
              Nhập lại mật khẩu mới
            </label>
            <div className="auth-password-field">
              <input
                id="reset-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                {...register('confirmPassword')}
                placeholder="Nhập lại đúng mật khẩu phía trên"
                className="auth-input password-recovery-input"
                aria-invalid={Boolean(errors.confirmPassword)}
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
            className="auth-submit password-reset-submit"
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

          <div className="auth-footer-prompt password-recovery-footer">
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
