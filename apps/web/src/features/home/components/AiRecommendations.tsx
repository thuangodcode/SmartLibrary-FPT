import React from 'react';
import { Sparkles, Sliders, ChevronRight } from 'lucide-react';
import type { Book } from '../types';
import { BookCard } from './BookCard';

interface AiRecommendationsProps {
  books: Book[];
  isLoggedIn?: boolean;
}

export const AiRecommendations: React.FC<AiRecommendationsProps> = ({
  books,
  isLoggedIn = true,
}) => {
  return (
    <section className="py-16 relative overflow-hidden">
      {/* Background Gradient Layer */}
      <div className="absolute inset-0 bg-ai-subtle -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ai-gradient text-white text-xs font-bold mb-3 shadow-md">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cá nhân hóa bởi AI Engine</span>
            </div>
            <h2 className="font-serif font-bold text-2xl sm:text-4xl text-slate-900 dark:text-white">
              Gợi Ý Dành Riêng Cho Bạn
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-xl">
              Danh sách sách được đề xuất dựa trên ngành học, tiến độ đồ án và thói quen mượn sách của bạn.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5" />
              <span>Thiết lập sở thích đọc</span>
            </button>
          </div>
        </div>

        {/* Logged in state: Show AI recommendations grid */}
        {isLoggedIn ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {books.slice(0, 4).map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          /* Guest state: Call-to-action banner */
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl border border-indigo-100 dark:border-indigo-900 text-center space-y-4 max-w-2xl mx-auto shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-ai-gradient text-white flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="font-serif font-bold text-xl text-slate-900 dark:text-white">
              Đăng nhập để trải nghiệm AI Gợi Ý
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Hệ thống sẽ phân tích chương trình học của trường và đề xuất chính xác sách bạn cần mượn trong kỳ này.
            </p>
            <div className="pt-2">
              <button className="px-6 py-3 rounded-xl bg-ai-gradient text-white font-semibold text-sm shadow-lg hover:opacity-95 transition-opacity inline-flex items-center gap-2">
                <span>Đăng Nhập Ngay</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
