import React from 'react';
import { Search, BookmarkCheck, Building2, RefreshCw } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      step: '01',
      title: 'Tìm Sách Bằng AI',
      description: 'Nhập câu mô tả tự nhiên hoặc tên sách. AI sẽ gợi ý chính xác giáo trình phù hợp.',
      icon: Search,
      color: 'bg-blue-500 text-white',
    },
    {
      step: '02',
      title: 'Đăng Ký Đặt Mượn',
      description: 'Xác nhận mượn trực tuyến. Hệ thống giữ sách tại quầy trong 24 giờ cho bạn.',
      icon: BookmarkCheck,
      color: 'bg-purple-500 text-white',
    },
    {
      step: '03',
      title: 'Nhận Sách Tại Quầy',
      description: 'Đến thư viện quét mã QR trên ứng dụng mobile để nhận sách chỉ trong 30 giây.',
      icon: Building2,
      color: 'bg-amber-500 text-white',
    },
    {
      step: '04',
      title: 'Trả Hoặc Gia Hạn',
      description: 'Tự động nhắc hạn trả. Gia hạn trực tuyến mượt mà chỉ với một chạm.',
      icon: RefreshCw,
      color: 'bg-emerald-500 text-white',
    },
  ];

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="font-serif font-bold text-3xl sm:text-4xl text-slate-900 dark:text-white">
            Quy Trình Mượn Sách Đơn Giản
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-2">
            Chỉ với 4 bước nhanh chóng để trải nghiệm dịch vụ thư viện số hiện đại
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {steps.map((item, index) => {
            const Icon = item.icon;

            return (
              <div key={index} className="relative group text-center space-y-4">
                {/* Step Icon & Badge */}
                <div className="relative inline-flex items-center justify-center">
                  <div
                    className={`w-16 h-16 rounded-3xl ${item.color} shadow-lg shadow-indigo-500/10 flex items-center justify-center text-2xl font-bold group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="w-8 h-8" />
                  </div>
                  <span className="absolute -top-2 -right-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-extrabold text-xs w-7 h-7 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                    {item.step}
                  </span>
                </div>

                <h3 className="font-serif font-bold text-lg text-slate-900 dark:text-white">
                  {item.title}
                </h3>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
