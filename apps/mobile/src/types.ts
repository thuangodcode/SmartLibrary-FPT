export type AppRole = 'Reader' | 'Librarian';

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  role: AppRole;
  status: string;
  permissions?: string[];
}

export interface Book {
  id: string;
  code?: string;
  isbn?: string | null;
  title: string;
  author?: string;
  authorNames?: string[];
  authors?: string[];
  publisher?: string;
  coverImageUrl?: string;
  categoryName?: string;
  categoryNames?: string[];
  availableCopies?: number;
  totalCopies?: number;
  averageRating?: number;
  reviewCount?: number;
  borrowCount?: number;
}

export interface Loan {
  id: string;
  bookTitle?: string;
  title?: string;
  barcode?: string;
  status?: string;
  displayStatus?: string;
  borrowDate?: string;
  dueDate?: string;
  readerName?: string;
  code?: string;
}

export interface ApiResponse<T> {
  success?: boolean;
  error?: string;
  data?: T;
  meta?: Record<string, unknown>;
}
