import React, { useState } from 'react';
import { Search, Sparkles, SlidersHorizontal, ArrowRight, Zap } from 'lucide-react';

interface AiSearchBarProps {
  onSearch?: (query: string, mode: 'fast' | 'ai') => void;
}

export const AiSearchBar: React.FC<AiSearchBarProps> = ({ onSearch }) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'fast'>('ai');
  const [query, setQuery] = useState('');

  const sampleChips = [
    'Machine Learning cho người mới bắt đầu',
    'Giáo trình Lập trình Web FPT',
    'Kỹ năng thuyết trình bảo vệ Capstone',
    'Cơ sở dữ liệu PostgreSQL & Supabase',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch?.(query, activeTab);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Search Mode Tabs */}
      <div className="flex items-center justify-center mb-3">
        <div className="inline-flex p-1 rounded-2xl bg-slate-200/60 dark:bg-slate-800/80 backdrop-blur-md border border-slate-300/50 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 ${
              activeTab === 'ai'
                ? 'bg-ai-gradient text-white shadow-lg shadow-indigo-500/25'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span>Tìm Bằng AI (Ngữ Nghĩa)</span>
            <span className="ml-1 text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              Smart
            </span>
          </button>

          <button
            onClick={() => setActiveTab('fast')}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 ${
              activeTab === 'fast'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Tìm Nhanh (Từ khóa/ISBN)</span>
          </button>
        </div>
      </div>

      {/* Main Search Bar Input Container */}
      <form
        onSubmit={handleSubmit}
        className={`relative group rounded-3xl transition-all duration-300 ${
          activeTab === 'ai'
            ? 'p-1 bg-ai-gradient shadow-xl shadow-purple-500/10'
            : 'p-1 bg-slate-200 dark:bg-slate-800'
        }`}
      >
        <div className="relative flex items-center bg-white dark:bg-slate-900 rounded-[22px] px-4 py-3 sm:py-4 shadow-inner">
          <div className="pl-2 pr-3 text-indigo-600 dark:text-indigo-400">
            {activeTab === 'ai' ? (
              <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400 animate-spin-slow" />
            ) : (
              <Search className="w-6 h-6 text-slate-400" />
            )}
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              activeTab === 'ai'
                ? 'Nhập mô tả thói quen đọc, ví dụ: "Tìm sách dạy lập trình Web cho người chưa biết gì..."'
                : 'Nhập tên sách, tác giả, chuyên ngành hoặc mã ISBN...'
            }
            className="w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 text-sm sm:text-base focus:outline-none pr-2 font-medium"
          />

          <div className="flex items-center gap-2 pl-2">
            <button
              type="button"
              className="hidden sm:flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Lọc</span>
            </button>

            <button
              type="submit"
              className={`px-6 py-2.5 sm:py-3 rounded-xl font-semibold text-sm text-white flex items-center gap-2 shadow-md transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                activeTab === 'ai'
                  ? 'bg-ai-gradient hover:opacity-95'
                  : 'bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500'
              }`}
            >
              <span>{activeTab === 'ai' ? 'AI Tìm Kiếm' : 'Tìm Kiếm'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>

      {/* Suggested Chips */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-medium mr-1">
          <Zap className="w-3 h-3 text-amber-500" />
          Gợi ý tìm kiếm:
        </span>
        {sampleChips.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => {
              setQuery(chip);
              onSearch?.(chip, activeTab);
            }}
            className="text-xs px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-600 dark:hover:text-indigo-300 border border-slate-200/60 dark:border-slate-700/60 transition-all"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
};
