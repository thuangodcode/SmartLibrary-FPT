import React from 'react';
import { Star, CheckCircle, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import type { Book } from '../types';
import { BookCover } from './BookCover';

interface BookCardProps {
  book: Book;
  onSelect?: (book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({ book, onSelect }) => {
  const statusBadges = {
    available: {
      text: 'Còn sách',
      color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      icon: CheckCircle,
    },
    reserved_only: {
      text: 'Đặt trước',
      color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      icon: Clock,
    },
    maintenance: {
      text: 'Bảo trì',
      color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700',
      icon: AlertTriangle,
    },
  };

  const currentStatus = statusBadges[book.status];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="group relative bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
      {/* AI Match Badge (if present) */}
      {book.matchScore && (
        <div className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-full bg-ai-gradient text-white text-xs font-semibold shadow-md flex items-center gap-1">
          <span>{book.matchScore}% Match</span>
        </div>
      )}

      {/* Book Cover Container */}
      <div className="flex justify-center mb-4 pt-2">
        <BookCover
          title={book.title}
          author={book.author}
          category={book.category}
          coverGradient={book.coverGradient}
          size="md"
        />
      </div>

      {/* Book Info */}
      <div className="space-y-2 flex-grow flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-medium truncate max-w-[60%]">{book.category}</span>
            <div className="flex items-center gap-1 text-amber-500 font-semibold">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span>{book.rating}</span>
              <span className="text-slate-400 font-normal">({book.reviewCount})</span>
            </div>
          </div>

          <h3 className="font-serif font-bold text-base text-slate-900 dark:text-white line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {book.title}
          </h3>

          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
            Tác giả: {book.author}
          </p>
        </div>

        {/* AI Recommendation Reason */}
        {book.recommendReason && (
          <div className="p-2.5 rounded-xl bg-ai-subtle border border-indigo-100 dark:border-indigo-900/50 text-xs text-indigo-900 dark:text-indigo-200">
            <p className="line-clamp-2 leading-relaxed font-medium">
              💡 {book.recommendReason}
            </p>
          </div>
        )}

        {/* Footer: Availability & CTA */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between mt-2">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${currentStatus.color}`}
          >
            <StatusIcon className="w-3 h-3" />
            {currentStatus.text} ({book.availableCopies}/{book.totalCopies})
          </span>

          <button
            onClick={() => onSelect?.(book)}
            className="p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs font-semibold"
            aria-label={`Xem chi tiết ${book.title}`}
          >
            <span>Chi tiết</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
