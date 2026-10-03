import React from 'react';
import { BookOpen, Mail, Phone, MapPin, Globe } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-800">
          {/* Column 1: Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-ai-gradient flex items-center justify-center text-white shadow-lg">
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="font-serif font-bold text-xl tracking-tight text-white">
                Smart<span className="text-ai-gradient font-serif italic">Library</span>
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              Hệ thống quản lý thư viện thông minh thế hệ mới tích hợp công nghệ AI Tìm kiếm Ngữ Nghĩa và Đề xuất cá nhân hóa. Đồ án tốt nghiệp Capstone 2026.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <a href="#" className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                <Globe className="w-4 h-4" />
              </a>
              <a href="#" className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                <Globe className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div className="space-y-3">
            <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">Liên Kết Nhanh</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="/" className="hover:text-white transition-colors">Trang Chủ</a></li>
              <li><a href="#categories" className="hover:text-white transition-colors">Danh Mục Sách</a></li>
              <li><a href="#ai-recommend" className="hover:text-white transition-colors">Gợi Ý AI</a></li>
              <li><a href="#services" className="hover:text-white transition-colors">Dịch Vụ Mượn Trả</a></li>
              <li><a href="#news" className="hover:text-white transition-colors">Tin Tức & Thông Báo</a></li>
            </ul>
          </div>

          {/* Column 3: Student Services */}
          <div className="space-y-3">
            <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">Dịch Vụ Sinh Viên</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="#" className="hover:text-white transition-colors">Tra Cứu Hạn Trả Sách</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Đặt Phòng Học Nhóm</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Hướng Dẫn Gia Hạn</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Quy Định Phạt Quá Hạn</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Góp Ý & Khiếu Nại</a></li>
            </ul>
          </div>

          {/* Column 4: Contact Info */}
          <div className="space-y-3">
            <h4 className="font-serif font-bold text-sm text-white uppercase tracking-wider">Liên Hệ Thư Viện</h4>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Khu Công Nghệ Cao, TP. Thủ Đức, TP. HCM</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>(028) 7300 5588</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>library@fpt.edu.vn</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© 2026 SmartLibrary Project. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-slate-400">Điều khoản sử dụng</a>
            <a href="#" className="hover:text-slate-400">Chính sách bảo mật</a>
            <a href="#" className="hover:text-slate-400">Sơ đồ trang</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
