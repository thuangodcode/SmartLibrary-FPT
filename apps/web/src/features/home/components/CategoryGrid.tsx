import React from 'react';
import { Code, Sparkles, TrendingUp, Palette, Compass, Globe, ArrowRight, HelpCircle } from 'lucide-react';
import type { Category } from '../types';

interface CategoryGridProps {
  categories: Category[];
  onSelectCategory?: (category: Category) => void;
}

export const CategoryGrid: React.FC<CategoryGridProps> = ({ categories, onSelectCategory }) => {
  const iconMap: Record<string, React.ElementType> = {
    Code,
    Sparkles,
    TrendingUp,
    Palette,
    Compass,
    Globe,
  };

  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-serif font-bold text-3xl sm:text-4xl text-slate-900 dark:text-white">
            Khám Phá Theo Chuyên Ngành
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-2">
            Hàng ngàn đầu sách giáo trình, tài liệu tham khảo được phân loại khoa học theo ngành học
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat) => {
            const Icon = iconMap[cat.iconName] || HelpCircle;

            return (
              <div
                key={cat.id}
                onClick={() => onSelectCategory?.(cat)}
                className="group cursor-pointer bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-start justify-between"
              >
                <div className="space-y-3">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${cat.colorClass}`}>
                    <Icon className="w-6 h-6" />
                  </div>

                  <div>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {cat.description}
                    </p>
                  </div>

                  <span className="inline-block text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                    {cat.bookCount.toLocaleString('vi-VN')} cuốn sách
                  </span>
                </div>

                <div className="p-2 rounded-xl text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/60 transition-colors">
                  <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
