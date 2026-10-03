import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';

export const AnnouncementBar: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-ai-gradient text-white text-xs font-medium py-2 px-4 relative z-50 flex items-center justify-between shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-center flex-grow pr-6">
        <Sparkles className="w-3.5 h-3.5 shrink-0 animate-pulse text-amber-300" />
        <span className="truncate">
          🎉 <strong>Tính năng mới:</strong> SmartLibrary đã cập nhật AI Search Ngữ Nghĩa & Đặt Phòng Học Nhóm Trực Tuyến!
        </span>
        <a href="#ai-search" className="underline font-bold hover:text-amber-200 shrink-0 ml-1">
          Khám phá ngay &rarr;
        </a>
      </div>

      <button
        onClick={() => setIsVisible(false)}
        className="p-1 rounded-full hover:bg-white/20 transition-colors shrink-0"
        aria-label="Đóng thông báo"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
