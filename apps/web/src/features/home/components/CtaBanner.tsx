import React from 'react';
import { Sparkles, ArrowRight, Smartphone } from 'lucide-react';

export const CtaBanner: React.FC = () => {
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 text-white p-8 sm:p-12 lg:p-16 overflow-hidden shadow-2xl">
          {/* Decorative Blur Backgrounds */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-amber-300 text-xs font-bold border border-white/10">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sẵn Sàng Trải Nghiệm Thư Viện Thông Minh?</span>
            </div>

            <h2 className="font-serif font-bold text-3xl sm:text-5xl tracking-tight leading-tight">
              Bắt đầu mượn sách và học tập cùng AI ngay hôm nay
            </h2>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl font-normal">
              Đăng nhập bằng tài khoản email sinh viên để kích hoạt tính năng gợi ý cá nhân hóa và quản lý mượn sách mượt mà trên cả Web & Mobile App.
            </p>

            <div className="pt-4 flex flex-wrap items-center gap-4">
              <button className="px-8 py-3.5 rounded-2xl bg-ai-gradient text-white font-semibold text-sm shadow-xl hover:opacity-95 transition-all flex items-center gap-2">
                <span>Tạo Tài Khoản Sinh Viên</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button className="px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-sm font-semibold transition-colors flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                <span>Tải App Mobile (Expo)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
