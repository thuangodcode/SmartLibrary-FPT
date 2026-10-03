import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Lock, User as UserIcon, ArrowRight, Check, Phone, MapPin, Calendar, UploadCloud, FileText, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout';
import { ToastNotification } from '../../../components/ui/ToastNotification';
import { registerSchema, type RegisterInput } from '../schemas/authSchemas';
import { DocumentUploader } from '../components/DocumentUploader';

const API_BASE_URL = 'http://localhost:5278';

export const RegisterPage: React.FC = () => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ id: string; type: 'success' | 'error' | 'info'; title: string; message: string } | null>(null);

  // Stored form data from Step 1
  const [savedInfo, setSavedInfo] = useState<RegisterInput | null>(null);

  // Step 2: OTP State
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState<number>(0);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 3: Document Upload State
  const [docType, setDocType] = useState('NationalId');
  const [frontDoc, setFrontDoc] = useState<File | null>(null);
  const [backDoc, setBackDoc] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  // Countdown timer for Resend OTP
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Step 1: Submit info and send OTP to real email / backend
  const onSubmitInfo = async (data: RegisterInput) => {
    setIsLoading(true);
    setToast(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, fullName: data.fullName }),
      });

      const resJson = await response.json();

      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || 'Không thể gửi mã xác nhận đến email này.');
      }

      setSavedInfo(data);
      if (resJson.data?.otp) {
        setDevOtpHint(resJson.data.otp);
      }
      setResendCountdown(60);
      setStep(2); // Go to Email Verification
      setToast({
        id: Date.now().toString(),
        type: 'success',
        title: 'Đã gửi mã OTP',
        message: 'Mã xác thực gồm 6 chữ số đã được gửi tới email của bạn.',
      });
    } catch (err: unknown) {
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Lỗi',
        message: err instanceof Error ? err.message : 'Không thể gửi mã xác minh',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Handle OTP input typing, auto-focus next & backspace
  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otpDigits];
    newOtp[index] = digit;
    setOtpDigits(newOtp);

    // Auto focus next box if digit entered
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData) {
      const newOtp = [...otpDigits];
      for (let i = 0; i < pastedData.length; i++) {
        newOtp[i] = pastedData[i];
      }
      setOtpDigits(newOtp);
      const nextFocus = Math.min(pastedData.length, 5);
      otpInputRefs.current[nextFocus]?.focus();
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (!savedInfo?.email || resendCountdown > 0) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: savedInfo.email, fullName: savedInfo.fullName }),
      });
      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || 'Gửi lại mã OTP thất bại.');
      }
      if (resJson.data?.otp) {
        setDevOtpHint(resJson.data.otp);
      }
      setResendCountdown(60);
      setToast({
        id: Date.now().toString(),
        type: 'info',
        title: 'Đã gửi lại OTP',
        message: 'Mã xác thực mới đã được gửi tới email của bạn.',
      });
    } catch (err: unknown) {
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Lỗi',
        message: err instanceof Error ? err.message : 'Không thể gửi lại mã',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP via Backend
  const handleVerifyEmail = async () => {
    const fullOtp = otpDigits.join('');
    if (fullOtp.length < 6) {
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Chưa đủ 6 số',
        message: 'Vui lòng nhập đủ 6 chữ số mã OTP đã gửi qua email.',
      });
      return;
    }

    if (!savedInfo?.email) {
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Lỗi',
        message: 'Thông tin email không hợp lệ. Vui lòng quay lại bước 1.',
      });
      return;
    }

    setIsLoading(true);
    setToast(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: savedInfo.email, otp: fullOtp }),
      });

      const resJson = await response.json();

      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || 'Mã xác thực OTP không chính xác hoặc đã hết hạn.');
      }

      setToast({
        id: Date.now().toString(),
        type: 'success',
        title: 'Xác thực thành công',
        message: 'Email của bạn đã được xác minh. Hãy nộp ảnh giấy tờ tùy thân.',
      });

      setStep(3); // Advance to Step 3
    } catch (err: unknown) {
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Xác minh thất bại',
        message: err instanceof Error ? err.message : 'Mã OTP không hợp lệ',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Upload files and submit reader registration
  const handleSubmitDocs = async () => {
    if (!frontDoc) {
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Thiếu giấy tờ',
        message: 'Vui lòng tải lên ảnh mặt trước của giấy tờ tùy thân.',
      });
      return;
    }

    if (docType === 'NationalId' && !backDoc) {
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Thiếu mặt sau',
        message: 'CCCD/CMND yêu cầu phải có cả ảnh mặt sau.',
      });
      return;
    }

    if (!savedInfo) {
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Lỗi',
        message: 'Thông tin cá nhân bị thiếu. Vui lòng thử lại từ đầu.',
      });
      return;
    }

    setIsLoading(true);
    setToast(null);

    try {
      const formData = new FormData();
      formData.append('fullName', savedInfo.fullName);
      formData.append('email', savedInfo.email);
      formData.append('password', savedInfo.password);
      if (savedInfo.phone) formData.append('phone', savedInfo.phone);
      if (savedInfo.address) formData.append('address', savedInfo.address);
      if (savedInfo.dateOfBirth) formData.append('dateOfBirth', savedInfo.dateOfBirth);
      formData.append('documentType', docType);
      formData.append('otp', otpDigits.join(''));

      formData.append('front', frontDoc);
      if (backDoc) formData.append('back', backDoc);
      if (selfie) formData.append('selfie', selfie);

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/register-reader`, {
        method: 'POST',
        body: formData,
      });

      const resJson = await response.json();

      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || 'Nộp hồ sơ thất bại. Vui lòng kiểm tra lại ảnh hoặc kết nối mạng.');
      }

      setToast({
        id: Date.now().toString(),
        type: 'success',
        title: 'Thành công',
        message: 'Đăng ký tài khoản và nộp hồ sơ thành công! Đơn đã được chuyển đến Thủ thư.',
      });

      setStep(4); // Advance to Wait for Approval
    } catch (err: unknown) {
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Gửi thất bại',
        message: err instanceof Error ? err.message : 'Không thể gửi giấy tờ đến máy chủ.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Đăng Ký Độc Giả Ngoài"
      subtitle="Vui lòng hoàn thành 4 bước để sử dụng dịch vụ thư viện."
    >
      {/* Stepper Header */}
      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 dark:bg-slate-800 -z-10 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-500"
            style={{ width: `${((step - 1) / 3) * 100}%` }}
          ></div>
        </div>
        {[
          { id: 1, label: 'Thông tin' },
          { id: 2, label: 'Email OTP' },
          { id: 3, label: 'Giấy tờ' },
          { id: 4, label: 'Chờ duyệt' },
        ].map((s) => (
          <div key={s.id} className="flex flex-col items-center gap-1.5 bg-white dark:bg-slate-950 p-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step >= s.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-400'
              }`}
            >
              {step > s.id ? <Check className="w-4 h-4" /> : s.id}
            </div>
            <span
              className={`text-[10px] font-medium ${
                step >= s.id ? 'text-indigo-600 font-bold' : 'text-slate-400'
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* STEP 1: Personal Information */}
      {step === 1 && (
        <form onSubmit={handleSubmit(onSubmitInfo)} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Họ và tên</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn An"
                  {...register('fullName')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs focus:border-indigo-600 focus:outline-none"
                />
              </div>
              {errors.fullName && <p className="text-[10px] text-rose-500 mt-1">{errors.fullName.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Số điện thoại</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="0912345678"
                  {...register('phone')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs focus:border-indigo-600 focus:outline-none"
                />
              </div>
              {errors.phone && <p className="text-[10px] text-rose-500 mt-1">{errors.phone.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ngày sinh</label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  {...register('dateOfBirth')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs focus:border-indigo-600 focus:outline-none"
                />
              </div>
              {errors.dateOfBirth && <p className="text-[10px] text-rose-500 mt-1">{errors.dateOfBirth.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Địa chỉ Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  placeholder="example@gmail.com"
                  {...register('email')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs focus:border-indigo-600 focus:outline-none"
                />
              </div>
              {errors.email && <p className="text-[10px] text-rose-500 mt-1">{errors.email.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Địa chỉ thường trú</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành..."
                {...register('address')}
                className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs focus:border-indigo-600 focus:outline-none"
              />
            </div>
            {errors.address && <p className="text-[10px] text-rose-500 mt-1">{errors.address.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Mật khẩu</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="Tối thiểu 8 ký tự..."
                  {...register('password')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs focus:border-indigo-600 focus:outline-none"
                />
              </div>
              {errors.password && <p className="text-[10px] text-rose-500 mt-1">{errors.password.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Xác nhận mật khẩu</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="Nhập lại mật khẩu..."
                  {...register('confirmPassword')}
                  className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs focus:border-indigo-600 focus:outline-none"
                />
              </div>
              {errors.confirmPassword && <p className="text-[10px] text-rose-500 mt-1">{errors.confirmPassword.message}</p>}
            </div>
          </div>

          <div className="flex items-start gap-2 pt-1">
            <input
              type="checkbox"
              id="agreeTerms"
              {...register('agreeTerms')}
              className="w-4 h-4 rounded text-indigo-600 mt-0.5"
            />
            <label htmlFor="agreeTerms" className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
              Tôi đồng ý với chính sách xử lý dữ liệu cá nhân & Điều khoản dịch vụ thư viện FPT.
            </label>
          </div>
          {errors.agreeTerms && <p className="text-[10px] text-rose-500">{errors.agreeTerms.message}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-2xl bg-slate-900 dark:bg-indigo-600 text-white font-semibold text-xs sm:text-sm shadow-xl hover:bg-slate-800 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Đang gửi mã xác minh...
              </>
            ) : (
              <>
                Tiếp Tục Nhận OTP <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}

      {/* STEP 2: Email OTP Verification */}
      {step === 2 && (
        <div className="space-y-6 text-center animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 mx-auto rounded-full flex items-center justify-center">
            <Mail className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Xác Minh Email</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 px-4">
              Chúng tôi đã gửi mã OTP gồm 6 chữ số đến email:{' '}
              <span className="font-bold text-indigo-600 dark:text-indigo-400 block mt-1 text-sm">
                {savedInfo?.email}
              </span>
            </p>
          </div>

          {/* Development OTP quick-fill helper */}
          {devOtpHint && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Mã xác thực: <strong className="font-mono text-sm tracking-widest">{devOtpHint}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setOtpDigits(devOtpHint.split(''));
                  otpInputRefs.current[5]?.focus();
                }}
                className="text-[11px] font-bold px-2.5 py-1 bg-amber-200 dark:bg-amber-800/80 hover:bg-amber-300 rounded-lg transition-colors"
              >
                Tự động điền
              </button>
            </div>
          )}

          {/* 6 Digit Inputs */}
          <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <input
                key={index}
                ref={(el) => { otpInputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={otpDigits[index]}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                className="w-10 h-12 text-center text-lg font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 focus:outline-none transition-all"
              />
            ))}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleVerifyEmail}
              disabled={isLoading || otpDigits.join('').length < 6}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-semibold text-sm shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Đang xác minh...
                </>
              ) : (
                'Xác Minh Email'
              )}
            </button>

            <div className="flex items-center justify-between px-2 pt-2 text-xs">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              >
                ← Đổi email khác
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCountdown > 0 || isLoading}
                className="text-indigo-600 font-bold hover:underline disabled:text-slate-400 disabled:no-underline flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {resendCountdown > 0 ? `Gửi lại sau (${resendCountdown}s)` : 'Gửi lại mã OTP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Document Upload */}
      {step === 3 && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3 flex gap-3 items-start">
            <Check className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-800 dark:text-amber-200">
              <strong className="block mb-1 text-xs">Yêu cầu giấy tờ:</strong>
              • Chụp rõ nét, không bị lóa sáng hay mất góc.<br />
              • Giấy tờ phải còn hạn sử dụng.<br />
              • Hình ảnh sẽ được lưu trữ an toàn trên máy chủ thư viện.
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Loại giấy tờ</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'NationalId', label: 'CCCD/CMND' },
                { key: 'StudentCard', label: 'Thẻ HSSV' },
                { key: 'DriverLicense', label: 'Bằng Lái Xe' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDocType(key)}
                  className={`py-2 px-1 rounded-xl border text-[11px] font-semibold transition-all ${
                    docType === key
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DocumentUploader label="Mặt trước *" onFileSelect={setFrontDoc} />
            <DocumentUploader
              label={`Mặt sau ${docType === 'NationalId' ? '*' : '(Tùy chọn)'}`}
              onFileSelect={setBackDoc}
            />
          </div>
          <DocumentUploader label="Ảnh Selfie cầm giấy tờ (Tùy chọn)" onFileSelect={setSelfie} />

          <button
            onClick={handleSubmitDocs}
            disabled={isLoading || !frontDoc || (docType === 'NationalId' && !backDoc)}
            className="w-full py-3.5 rounded-2xl bg-indigo-600 text-white font-semibold text-sm shadow-xl hover:bg-indigo-700 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải ảnh lên Cloudinary & lưu đơn...
              </>
            ) : (
              <>
                Gửi Yêu Cầu Duyệt <UploadCloud className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}

      {/* STEP 4: Success & Waiting for Approval */}
      {step === 4 && (
        <div className="space-y-6 text-center animate-in zoom-in-95 duration-500 py-6">
          <div className="w-24 h-24 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-500 mx-auto rounded-full flex items-center justify-center relative">
            <FileText className="w-10 h-10" />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-950">
              <Check className="w-5 h-5" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Đã Nộp Hồ Sơ Thành Công</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 px-4">
              Hồ sơ và giấy tờ của bạn đã được tải lên Cloudinary và chuyển đến ban Thủ thư thư viện FPT.
              Bạn sẽ nhận được email thông báo ngay khi hồ sơ được phê duyệt!
            </p>
          </div>
          <div className="pt-4 flex flex-col sm:flex-row justify-center gap-3">
            <a
              href="/login"
              className="py-3 px-8 rounded-full bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all text-center"
            >
              Đăng Nhập Ngay
            </a>
            <a
              href="/"
              className="py-3 px-8 rounded-full border-2 border-slate-200 dark:border-slate-800 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors text-center text-slate-700 dark:text-slate-300"
            >
              Trở Về Trang Chủ
            </a>
          </div>
        </div>
      )}

      {step !== 4 && (
        <div className="text-center pt-6 pb-2">
          <p className="text-xs text-slate-500">
            Sinh viên trường? Vui lòng <span className="font-bold">kiểm tra Email</span> để kích hoạt tài khoản.<br />
            Đã có tài khoản?{' '}
            <a href="/login" className="font-bold text-indigo-600 hover:underline">
              Đăng nhập ngay
            </a>
          </p>
        </div>
      )}

      <ToastNotification toast={toast} onClose={() => setToast(null)} />
    </AuthLayout>
  );
};

export default RegisterPage;
