import type { Book } from '../types';
import type { HomeBook } from '../hooks/useHomeData';

export const toBookCardData = (book: HomeBook): Book => ({
  id: book.id,
  categoryId: '',
  title: book.title,
  author: book.authorNames.join(', ') || 'Chưa cập nhật tác giả',
  category: book.categoryNames.join(' · ') || 'Chưa phân loại',
  isbn: book.isbn || '',
  publishYear: book.publishedYear ?? 0,
  publisher: '',
  coverImageUrl: book.coverImageUrl,
  coverGradient: 'from-slate-700 to-indigo-950',
  rating: book.averageRating ?? 0,
  reviewCount: 0,
  availableCopies: book.availableCopies,
  totalCopies: book.totalCopies,
  status: book.availableCopies > 0 ? 'available' : 'reserved_only',
  description: book.description || '',
});
