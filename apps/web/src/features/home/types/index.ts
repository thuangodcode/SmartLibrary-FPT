export interface Book {
  id: string;
  categoryId: string;
  title: string;
  author: string;
  category: string;
  isbn: string;
  publishYear: number;
  publisher: string;
  coverImageUrl?: string | null;
  coverGradient: string;
  rating: number;
  reviewCount: number;
  availableCopies: number;
  totalCopies: number;
  status: 'available' | 'reserved_only' | 'maintenance';
  description: string;
  matchScore?: number;
  matchLabel?: string;
  recommendReason?: string;
  isNewArrival?: boolean;
  borrowCount?: number;
}

export interface Category {
  id: string;
  name: string;
  iconName: string;
  bookCount: number;
  colorClass: string;
  description: string;
}

export interface NewsItem {
  id: string;
  title: string;
  date: string;
  category: string;
  summary: string;
  readTime: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface ServiceItem {
  id: string;
  title: string;
  description: string;
  iconName: string;
  route: string;
  badge?: string;
}
