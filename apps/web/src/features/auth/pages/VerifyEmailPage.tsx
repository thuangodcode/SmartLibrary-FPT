import React, { useState, useEffect } from 'react';
import { Mail, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { useSearchParams, useNavigate } from 'react-router-dom';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || 'bạn';
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [isVerifyingToken, setIsVerifyingToken] = useState(!!token);
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (token) {
      setTimeout(() => {
        setIsVerifyingToken(false);
        setVerificationSuccess(true);
      }, 1000);
    }
  }, [token]);

  const handleResend = () => {
    setCanResend(false);
    setCountdown(60);
  };

  if (isVerifyingToken) {
    return (
      <AuthLayout title="Đang Xác Minh Email" subtitle="Vui lòng chờ trong giây lát...">
        <div className="text-center py-8 space-y-4">
          <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Hệ thống đang kiểm tra mã OTP xác thực email...</p>
        </div>
      </AuthLayout>
    );
  }

  if (verificationSuccess) {
    return (
      <AuthLayout title="Xác Minh Thành Công!" subtitle="Tài khoản độc giả đã được kích hoạt thành công">
        <div className="text-center py-6 space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Cảm ơn bạn đã xác thực email. Bây giờ bạn đã có thể bắt đầu sử dụng đầy đủ dịch vụ mượn sách và nhận gợi ý AI từ SmartLibrary.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-semibold text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2"
          >
            <span>Đăng Nhập Ngay</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Xác Minh Địa Chỉ Email" subtitle="Hệ thống đã gửi mã OTP xác thực tới hộp thư của bạn">
      <div className="text-center space-y-6 py-4">
        <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 flex items-center justify-center mx-auto">
          <Mail className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Vui lòng kiểm tra hộp thư đến của email <strong className="text-slate-900 dark:text-white">{email}</strong> và làm theo hướng dẫn để hoàn tất đăng ký.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-500 space-y-2">
          <p>Chưa nhận được email?</p>
          <button
            onClick={handleResend}
            disabled={!canResend}
            className="font-bold text-indigo-600 hover:underline disabled:opacity-50 disabled:no-underline"
          >
            {canResend ? 'Gửi lại email xác minh OTP' : `Gửi lại sau ${countdown}s`}
          </button>
        </div>

        <div className="pt-2">
          <a href="/login" className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:underline">
            &larr; Quay lại trang Đăng nhập
          </a>
        </div>
      </div>
    </AuthLayout>
  );
};

export default VerifyEmailPage;
