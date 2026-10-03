import React from 'react';
import { Sparkles, Bell, Search, ShieldCheck } from 'lucide-react';

export const FeatureHighlights: React.FC = () => {
  const highlights = [
    {
      title: 'Tìm Kiếm Theo Ngữ Nghĩa (Semantic Search)',
      description: 'Không cần nhớ đúng tiêu đề hay tên tác giả. Hệ thống AI mã hóa ngữ nghĩa (Vector Embeddings) giúp bạn tìm sách theo ý tưởng hoặc mục tiêu dự án.',
      icon: Search,
      tag: 'AI Vector Search',
      badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    },
    {
      title: 'Thông Báo Tự Động & Hạn Trả Sách',
      description: 'Hệ thống tự động gửi thông báo qua Zalo/Email và Mobile App trước hạn trả 2 ngày. Hỗ trợ gia hạn online 1-click không lo quá hạn.',
      icon: Bell,
      tag: 'Smart Reminder',
      badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    },
    {
      title: 'Quản Lý Sách Đặt Trước Tự Động',
      description: 'Khi cuốn sách mượn hết có người trả lại, hệ thống sẽ ưu tiên giữ sách và gửi thông báo độc quyền cho người đăng ký hàng chờ đầu tiên.',
      icon: ShieldCheck,
      tag: 'Auto Reservation',
      badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    },
  ];

  return (
    <section className="py-20 bg-slate-100/60 dark:bg-slate-900/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-ai-subtle border border-purple-200 dark:border-purple-900 text-purple-700 dark:text-purple-300 text-xs font-bold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Công Nghệ Vượt Trội</span>
          </div>
          <h2 className="font-serif font-bold text-3xl sm:text-4xl text-slate-900 dark:text-white">
            Tính Năng Thông Minh Đi Đầu
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {highlights.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                key={index}
                className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-lg space-y-4 flex flex-col justify-between hover:border-indigo-500 transition-colors"
              >
                <div className="space-y-4">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${item.badgeColor}`}>
                    {item.tag}
                  </span>

                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                  </div>

                  <h3 className="font-serif font-bold text-xl text-slate-900 dark:text-white">
                    {item.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
