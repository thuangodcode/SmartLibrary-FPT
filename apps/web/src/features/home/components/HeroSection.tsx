import React from 'react';
import { Sparkles, BookOpen, Users, Bookmark, CheckCircle2 } from 'lucide-react';
import { AiSearchBar } from './AiSearchBar';

interface HeroSectionProps {
  stats: {
    totalTitles: number;
    availableCopies: number;
    activeReaders: number;
    monthlyBorrows: number;
  };
}

export const HeroSection: React.FC<HeroSectionProps> = ({ stats }) => {
  return (
    <section className="relative pt-12 pb-16 lg:pt-20 lg:pb-24 overflow-hidden">
      {/* Background Decorative Blur Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-indigo-500/10 dark:bg-indigo-600/15 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-purple-500/10 dark:bg-purple-600/10 rounded-full blur-2xl -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-80 h-80 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-2xl -z-10 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Content Column */}
          <div className="lg:col-span-7 text-center lg:text-left space-y-6">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Thư Viện Số Tích Hợp AI Đầu Tiên Tại Trường Đại Học</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
              Tìm đúng cuốn sách bạn cần,{' '}
              <span className="text-ai-gradient font-serif italic">chỉ bằng một câu mô tả</span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto lg:mx-0 font-normal leading-relaxed">
              Trải nghiệm mượn - trả sách thông minh với công nghệ tìm kiếm ngữ nghĩa AI, gợi ý giáo trình theo ngành học và tự động gia hạn thời gian mượn.
            </p>

            {/* Search Bar Component */}
            <div className="pt-2">
              <AiSearchBar />
            </div>
          </div>

          {/* Right Visual Graphic Column */}
          <div className="lg:col-span-5 relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md">
              {/* Main Illustration Container */}
              <div className="relative z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xl space-y-4">
                {/* Header preview of mock AI Card */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-ai-gradient flex items-center justify-center text-white font-bold text-xs">
                      AI
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">Smart Match Result</h4>
                      <p className="text-[10px] text-slate-500">Phân tích theo nhu cầu sinh viên</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                    98% Phù hợp
                  </span>
                </div>

                {/* Mock Floating Book Cards */}
                <div className="space-y-3">
                  <div className="p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 flex items-center gap-3">
                    <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-900 shrink-0 shadow-md flex items-center justify-center text-white text-[9px] font-bold p-1 text-center">
                      React 19 & TS
                    </div>
                    <div className="flex-grow min-w-0">
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">CNTT • Giáo trình</span>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate">Lập Trình Web Modern</h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">Khuyên dùng cho kỳ học này</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-amber-50/60 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/60 flex items-center gap-3">
                    <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-900 shrink-0 shadow-md flex items-center justify-center text-white text-[9px] font-bold p-1 text-center">
                      AI & ML
                    </div>
                    <div className="flex-grow min-w-0">
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Trí Tuệ Nhân Tạo</span>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate">Nhập Môn Machine Learning</h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">Còn 2 bản sẵn có</p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-center">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Tự động đặt giữ sách tại quầy chỉ 30s</span>
                  </p>
                </div>
              </div>

              {/* Floating Badge Accent */}
              <div className="absolute -top-4 -right-4 z-20 bg-ai-gradient text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-lg animate-bounce-slow flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Recommend</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stat Counter Bar */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {stats.totalTitles.toLocaleString('vi-VN')}+
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Đầu sách phong phú</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/80 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Bookmark className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {stats.availableCopies.toLocaleString('vi-VN')}+
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bản sao sẵn có</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/80 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {stats.activeReaders.toLocaleString('vi-VN')}+
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Sinh viên sử dụng</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {stats.monthlyBorrows.toLocaleString('vi-VN')}+
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Lượt mượn tháng này</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
