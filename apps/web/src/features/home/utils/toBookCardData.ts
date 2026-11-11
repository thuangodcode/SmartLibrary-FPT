import type { AiBookSuggestion, RagSource } from '../../ai/aiApi';
import type { HomeBook } from '../hooks/useHomeData';
import type { Book } from '../types';

const card = (input: {
  id: string;
  title: string;
  author?: string | null;
  category?: string;
  isbn?: string;
  publishYear?: number;
  coverImageUrl?: string | null;
  coverGradient?: string;
  rating?: number;
  reviewCount?: number;
  borrowCount?: number;
  availableCopies?: number;
  totalCopies?: number;
  description?: string;
  matchScore?: number;
  matchLabel?: string;
  recommendReason?: string;
}): Book => {
  const available = input.availableCopies ?? 0;
  return {
    id: input.id,
    categoryId: '',
    title: input.title,
    author: input.author || 'Chưa cập nhật tác giả',
    category: input.category || 'Chưa phân loại',
    isbn: input.isbn || '',
    publishYear: input.publishYear ?? 0,
    publisher: '',
    coverImageUrl: input.coverImageUrl ?? undefined,
    coverGradient: input.coverGradient ?? 'from-orange-700 to-slate-900',
    rating: input.rating ?? 0,
    reviewCount: input.reviewCount ?? 0,
    availableCopies: available,
    totalCopies: input.totalCopies ?? 0,
    status: available > 0 ? 'available' : 'reserved_only',
    description: input.description || '',
    matchScore: input.matchScore,
    matchLabel: input.matchLabel,
    recommendReason: input.recommendReason,
    borrowCount: input.borrowCount,
  };
};

export const toBookCardData = (book: HomeBook): Book => card({
  id: book.id,
  title: book.title,
  author: book.authorNames.join(', '),
  category: book.categoryNames.join(' · '),
  isbn: book.isbn || '',
  publishYear: book.publishedYear ?? 0,
  coverImageUrl: book.coverImageUrl,
  coverGradient: 'from-slate-700 to-indigo-950',
  rating: book.averageRating ?? 0,
  reviewCount: book.reviewCount,
  borrowCount: book.borrowCount,
  availableCopies: book.availableCopies,
  totalCopies: book.totalCopies,
  description: book.description || '',
});

export const toBookFromRag = (source: RagSource): Book => card({
  id: source.sourceId,
  title: source.title,
  author: source.author,
  category: source.categories?.join(' · '),
  isbn: source.isbn || source.code || '',
  publishYear: source.publishedYear ?? 0,
  coverImageUrl: source.coverImageUrl,
  availableCopies: source.availableCopies,
  totalCopies: source.totalCopies,
  description: source.location ? `Vị trí: ${source.location}` : '',
  matchLabel: source.matchLabel || undefined,
  recommendReason: [
    source.location ? `Vị trí: ${source.location}` : '',
    source.isbn ? `ISBN ${source.isbn}` : '',
    source.publishedYear ? `Năm ${source.publishedYear}` : '',
  ].filter(Boolean).join(' · ') || undefined,
});

export const toBookFromSuggestion = (item: AiBookSuggestion): Book => card({
  id: item.id,
  title: item.title,
  author: item.author,
  category: item.categories?.join(' · '),
  coverImageUrl: item.coverImageUrl,
  availableCopies: item.availableCopies,
  totalCopies: item.totalCopies,
  recommendReason: item.reason || undefined,
});
