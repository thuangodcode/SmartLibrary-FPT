import React from 'react';
import { BookOpen, CheckCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnnouncementBar } from '../../../components/layout/AnnouncementBar';
import libraryImage from '../../../assets/figma/thu-vien-fpt-auth.jpg';
import libraryLogo from '../../../assets/figma/auth-logo-fpt.png';
import './AuthLayout.css';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  variant?: 'classic' | 'design';
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
  variant = 'classic',
}) => {
  if (variant === 'design') {
    return (
      <div className="figma-auth-page" style={{ backgroundImage: `linear-gradient(130deg, rgb(250 252 251 / 92%), rgb(242 246 244 / 82%)), url(${libraryImage})` }}>
        <main className="figma-auth-panel">
          <nav className="figma-auth-nav" aria-label="Điều hướng xác thực">
            <Link to="/" className="figma-auth-logo" aria-label="SmartLibrary - Trang chủ">
              <img className="figma-auth-logo-image" src={libraryLogo} alt="FPT SmartLibrary" />
            </Link>
            <a href="mailto:library@fpt.edu.vn" className="figma-auth-support">Cần hỗ trợ?</a>
          </nav>

          <section className="figma-auth-content" aria-labelledby="auth-title">
            <div className="figma-auth-intro">
              <p className="figma-auth-eyebrow">CỔNG ĐỘC GIẢ SMARTLIBRARY</p>
              <h1 id="auth-title">{title}</h1>
              <p className="figma-auth-subtitle">{subtitle}</p>
            </div>
            {children}
            <p className="figma-auth-legal">
              Bằng cách tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư.
            </p>
          </section>
        </main>

        <aside className="figma-auth-visual">
          <img
            className="figma-auth-visual-image"
            src={libraryImage}
            alt="Không gian bên trong thư viện với các kệ sách"
          />
        </aside>
      </div>
    );
  }

  return (
      <div className="auth-classic-page min-h-screen bg-[#FAFAF8] dark:bg-[#0B0F17] flex flex-col justify-between" style={{ backgroundImage: `linear-gradient(rgb(246 248 247 / 88%), rgb(246 248 247 / 88%)), url(${libraryImage})` }}>
      <AnnouncementBar />

      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
          {/* Left Split Screen: Branding Hero */}
          <div className="auth-classic-visual hidden lg:flex lg:col-span-5 text-white p-10 flex-col justify-between relative overflow-hidden" style={{ backgroundImage: `linear-gradient(145deg, rgb(13 25 43 / 86%), rgb(28 33 59 / 72%)), url(${libraryImage})` }}>
            <div className="absolute top-0 left-0 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-6">
              <a href="/" className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-ai-gradient flex items-center justify-center text-white shadow-lg">
                  <BookOpen className="w-5 h-5" />
                </div>
                <span className="font-serif font-bold text-xl tracking-tight text-white">
                  Smart<span className="text-ai-gradient font-serif italic">Library</span>
                </span>
              </a>

              <div className="space-y-2 pt-6">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-amber-300 text-xs font-bold border border-white/10">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Hệ Thống Thư Viện AI 2026</span>
                </div>
                <h2 className="font-serif font-bold text-3xl leading-snug">
                  Tri thức thông minh cho sinh viên FPT
                </h2>
              </div>
            </div>

            <div className="relative z-10 space-y-4 pt-8">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-300">
                  Tìm kiếm bằng mô tả ngữ nghĩa AI không cần tên sách chuẩn.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-300">
                  Gia hạn mượn sách & nhận thông báo tự động qua Zalo/Email.
                </p>
              </div>
            </div>

            <div className="relative z-10 pt-6 border-t border-white/10 text-[11px] text-slate-400">
              © 2026 SmartLibrary Capstone Project. All rights reserved.
            </div>
          </div>

          {/* Right Split Screen: Form Container */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
            <div className="max-w-md mx-auto w-full space-y-6">
              <div>
                <h2 className="font-serif font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white">
                  {title}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {subtitle}
                </p>
              </div>

              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
