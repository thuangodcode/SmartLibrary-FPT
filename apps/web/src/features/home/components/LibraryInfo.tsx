import React from 'react';
import { Clock, MapPin, Wifi, Monitor, Users, FileText } from 'lucide-react';

export const LibraryInfo: React.FC = () => {
  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Info Column */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Thông Tin & Tiện Ích
              </span>
              <h2 className="font-serif font-bold text-3xl sm:text-4xl text-slate-900 dark:text-white mt-1">
                Không Gian Học Tập & Nghiên Cứu Đạt Chuẩn
              </h2>
            </div>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Thư viện SmartLibrary sở hữu hơn 2.000m² diện tích sử dụng với 500+ chỗ ngồi đọc sách, trang bị hệ thống Wi-Fi 6 tốc độ cao, điều hòa 24/7 và khu vực tự học chuyên biệt.
            </p>

            {/* Opening Hours & Location Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">Giờ Mở Cửa</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Thứ 2 - Thứ 6: 07:30 - 21:00</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Thứ 7 - CN: 08:00 - 17:00</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">Địa Điểm Thư Viện</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Tòa nhà Alpha, Khu Công Nghệ Cao</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">TP. Thủ Đức, TP. Hồ Chí Minh</p>
                </div>
              </div>
            </div>

            {/* Amenities Icons */}
            <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                <Wifi className="w-4 h-4 text-indigo-500" />
                Wi-Fi 6 Miễn Phí
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                <Monitor className="w-4 h-4 text-purple-500" />
                50+ Máy Tính Tra Cứu
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                <Users className="w-4 h-4 text-amber-500" />
                12 Phòng Học Nhóm
              </span>
            </div>
          </div>

          {/* Right Policy & Visual Box */}
          <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-8 rounded-3xl shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-md text-amber-400">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-white">Nội Quy Mượn Trả Tóm Tắt</h3>
                <p className="text-xs text-slate-300">Độc giả vui lòng tuân thủ quy định</p>
              </div>
            </div>

            <ul className="space-y-3 text-xs text-slate-300 leading-relaxed list-disc list-inside">
              <li>Mượn tối đa 5 cuốn sách/lần (8 cuốn đối với sinh viên Đồ án).</li>
              <li>Thời gian giữ sách mượn là 14 ngày, gia hạn tối đa 2 lần.</li>
              <li>Bảo quản sách cẩn thận, không gạch chân hoặc làm rách trang.</li>
              <li>Xuất trình thẻ sinh viên hoặc ứng dụng Mobile khi qua cửa soát vé.</li>
            </ul>

            <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold transition-colors">
              Xem Toàn Bộ Quy Định Thư Viện
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
