import React from 'react';
import { BookOpen, RefreshCw, Users, CreditCard, ArrowUpRight, HelpCircle } from 'lucide-react';
import type { ServiceItem } from '../types';
import { useNavigate } from 'react-router-dom';

interface QuickServicesProps {
  services: ServiceItem[];
}

export const QuickServices: React.FC<QuickServicesProps> = ({ services }) => {
  const navigate = useNavigate();

  const iconMap: Record<string, React.ElementType> = {
    BookOpen,
    RefreshCw,
    Users,
    CreditCard,
  };

  return (
    <section className="py-12 bg-slate-100/60 dark:bg-slate-900/40 border-y border-slate-200/60 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="font-serif font-bold text-2xl sm:text-3xl text-slate-900 dark:text-white">
              Dịch Vụ Nhanh
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Các tiện ích mượn trả và hỗ trợ thư viện số dành cho sinh viên
            </p>
          </div>
          <button
            onClick={() => navigate('/services')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <span>Xem tất cả dịch vụ</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((item) => {
            const Icon = iconMap[item.iconName] || HelpCircle;

            return (
              <div
                key={item.id}
                onClick={() => navigate(item.route)}
                className="group relative cursor-pointer bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                {item.badge && (
                  <span className="absolute top-4 right-4 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    {item.badge}
                  </span>
                )}

                <div>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                    <Icon className="w-6 h-6" />
                  </div>

                  <h3 className="font-bold text-base text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {item.title}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                    {item.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  <span>Truy cập dịch vụ</span>
                  <ArrowUpRight className="w-4 h-4 transform group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
