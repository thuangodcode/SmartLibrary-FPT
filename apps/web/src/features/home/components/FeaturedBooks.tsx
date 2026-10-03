import React, { useState } from 'react';
import { ArrowRight, Flame, Eye, Sparkles } from 'lucide-react';
import type { Book } from '../types';
import { BookCard } from './BookCard';

interface FeaturedBooksProps {
  popularBooks: Book[];
  recentArrivals: Book[];
  aiRecommendations: Book[];
}

export const FeaturedBooks: React.FC<FeaturedBooksProps> = ({
  popularBooks,
  recentArrivals,
  aiRecommendations,
}) => {
  const [activeTab, setActiveTab] = useState<'popular' | 'views' | 'new'>('popular');

  const getActiveBooks = () => {
    switch (activeTab) {
      case 'popular':
        return popularBooks;
      case 'views':
        return aiRecommendations;
      case 'new':
        return recentArrivals;
      default:
        return popularBooks;
    }
  };

  return (
    <section className="py-16 bg-slate-100/50 dark:bg-slate-900/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header & Tab Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h2 className="font-serif font-bold text-3xl sm:text-4xl text-slate-900 dark:text-white">
              Sách Nổi Bật Trong Thư Viện
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Tuyển tập giáo trình và tài liệu được sinh viên mượn và xem nhiều nhất
            </p>
          </div>

          {/* 3 Tabs */}
          <div className="inline-flex p-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <button
              onClick={() => setActiveTab('popular')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'popular'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Mượn Nhiều Nhất</span>
            </button>

            <button
              onClick={() => setActiveTab('views')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'views'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-blue-400" />
              <span>Xem Nhiều Nhất</span>
            </button>

            <button
              onClick={() => setActiveTab('new')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'new'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Mới Nhập Kho</span>
            </button>
          </div>
        </div>

        {/* Book Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {getActiveBooks().map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>

        {/* View All Button */}
        <div className="mt-12 text-center">
          <button className="px-8 py-3.5 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 hover:border-indigo-500 font-semibold text-sm shadow-sm hover:shadow-md transition-all inline-flex items-center gap-2">
            <span>Xem Tất Cả Danh Mục Sách</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
