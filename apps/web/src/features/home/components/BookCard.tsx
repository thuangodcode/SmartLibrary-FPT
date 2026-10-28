import React from 'react';
import { ArrowUpRight, BookOpen, Check, Clock3, Star } from 'lucide-react';
import type { Book } from '../types';
import { BookCover } from './BookCover';
import FavoriteBookButton from './FavoriteBookButton';
import './BookCard.css';
import './FavoriteBookButton.css';

interface BookCardProps {
  book: Book;
  onSelect?: (book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({ book, onSelect }) => {
  const displayTitle = book.title.length > 44 ? `${book.title.slice(0, 43).trimEnd()}…` : book.title;
  const statusBadges = {
    available: {
      text: 'Còn sách',
      icon: Check,
    },
    reserved_only: {
      text: 'Đặt trước',
      icon: Clock3,
    },
    maintenance: {
      text: 'Bảo trì',
      icon: BookOpen,
    },
  };

  const currentStatus = statusBadges[book.status];
  const StatusIcon = currentStatus.icon;

  return (
    <article className={`book-card book-card--${book.status}`} data-ui="book-card">
      <FavoriteBookButton bookId={book.id} title={book.title} />
      {book.matchLabel && (
        <div className="book-card__match">
          <span>{book.matchLabel}</span>
        </div>
      )}

      {/* Book Cover Container */}
      <button
        type="button"
        className="book-card__media"
        onClick={() => onSelect?.(book)}
        aria-label={`Mở sách ${book.title}`}
      >
        <BookCover
          title={book.title}
          author={book.author}
          category={book.category}
          coverImageUrl={book.coverImageUrl}
          coverGradient={book.coverGradient}
          className="book-card__cover"
          size="md"
        />
      </button>

      {/* Book Info */}
      <div className="book-card__body">
        <div className="book-card__copy">
          <div className="book-card__meta">
            <span className="book-card__category">{book.category}</span>
            <div className={`book-card__rating${book.reviewCount > 0 || book.borrowCount !== undefined ? ' has-metrics' : ''}`} aria-label={`${book.rating} trên 5 sao, ${book.reviewCount} đánh giá`}>
              <Star aria-hidden="true" />
              <span>{book.rating.toFixed(1)}</span>
              <small>{book.reviewCount ? `${book.reviewCount} đánh giá` : 'Chưa có đánh giá'}</small>
            </div>
          </div>

          <h3 className="book-card__title" aria-label={book.title} title={book.title}>
            {displayTitle}
          </h3>

          <p className="book-card__author">{book.author}</p>
          {book.borrowCount !== undefined && (
            <p className="book-card__borrow-count"><BookOpen aria-hidden="true" />{book.borrowCount.toLocaleString('vi-VN')} lượt mượn</p>
          )}
        </div>

        {/* AI Recommendation Reason */}
        {book.recommendReason && (
          <div className="book-card__reason">
            <p>{book.recommendReason}</p>
          </div>
        )}

        {/* Footer: Availability & CTA */}
        <div className="book-card__footer">
          <span className="book-card__availability">
            <StatusIcon aria-hidden="true" />
            <span>{currentStatus.text}</span>
            <small>{book.availableCopies}/{book.totalCopies}</small>
          </span>

          <button
            onClick={() => onSelect?.(book)}
            type="button"
            className="book-card__action"
            aria-label={`Xem chi tiết ${book.title}`}
          >
            <span>Chi tiết</span>
            <ArrowUpRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
};
