import React from 'react';
import { Sparkles, BookOpen } from 'lucide-react';
import './BookCover.css';

interface BookCoverProps {
  title: string;
  author: string;
  category: string;
  coverImageUrl?: string | null;
  coverGradient?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BookCover: React.FC<BookCoverProps> = ({
  title,
  author,
  category,
  coverImageUrl,
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
      className={`book-cover ${coverImageUrl ? 'book-cover--image' : 'book-cover--generated'} ${sizeClasses[size]} ${className}`}
    >
      {coverImageUrl ? (
        <img
          src={coverImageUrl}
          alt={`Bìa sách ${title}`}
          className="book-cover__image"
          loading="lazy"
        />
      ) : (
        <>
          <div className="book-cover__topline">
            <span>
              {category}
            </span>
            <BookOpen aria-hidden="true" />
          </div>
          <div className="book-cover__title">
            <span aria-hidden="true" />
            <h4>
              {title}
            </h4>
          </div>
          <div className="book-cover__byline">
            <p>{author}</p>
            <Sparkles aria-hidden="true" />
          </div>
        </>
      )}
    </div>
  );
};
