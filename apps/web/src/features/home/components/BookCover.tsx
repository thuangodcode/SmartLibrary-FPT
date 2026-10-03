import React from 'react';
import { Sparkles, BookOpen } from 'lucide-react';

interface BookCoverProps {
  title: string;
  author: string;
  category: string;
  coverGradient?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BookCover: React.FC<BookCoverProps> = ({
  title,
  author,
  category,
  coverGradient = 'from-indigo-700 to-slate-900',
  className = '',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'h-40 w-28 text-xs p-2.5',
    md: 'h-56 w-40 text-sm p-4',
    lg: 'h-72 w-52 text-base p-5',
  };

  return (
    <div
      className={`relative overflow-hidden rounded-lg shadow-md bg-gradient-to-br ${coverGradient} text-white flex flex-col justify-between transition-transform duration-300 hover:scale-[1.03] select-none ${sizeClasses[size]} ${className}`}
    >
      {/* Dynamic Background Pattern */}
      <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
      <div className="absolute -left-4 -top-4 w-20 h-20 rounded-full bg-amber-400/10 blur-lg pointer-events-none" />

      {/* Top Header info */}
      <div className="flex items-center justify-between z-10 opacity-80">
        <span className="text-[10px] font-semibold tracking-wider uppercase truncate max-w-[80%]">
          {category}
        </span>
        <BookOpen className="w-3.5 h-3.5" />
      </div>

      {/* Center Book Title & Decorative Element */}
      <div className="my-auto z-10 py-2">
        <div className="w-6 h-0.5 bg-amber-400/80 mb-2 rounded-full" />
        <h4 className="font-serif font-bold line-clamp-3 leading-snug tracking-tight text-white drop-shadow-sm">
          {title}
        </h4>
      </div>

      {/* Bottom Author Info */}
      <div className="z-10 pt-2 border-t border-white/15 flex items-center justify-between">
        <p className="text-[11px] font-medium opacity-90 truncate">{author}</p>
        <Sparkles className="w-3 h-3 text-amber-300 opacity-75 shrink-0" />
      </div>
    </div>
  );
};
