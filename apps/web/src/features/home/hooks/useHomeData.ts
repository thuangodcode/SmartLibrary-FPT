import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';

export interface HomeCategory {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  bookCount: number;
}

export interface HomeBook {
  id: string;
  code: string;
  title: string;
  isbn?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  publishedYear?: number | null;
  language?: string;
  totalCopies: number;
  availableCopies: number;
  averageRating?: number;
  authorNames: string[];
  categoryNames: string[];
  copyLocations?: string[];
}

export interface BookReview {
  id: string;
  readerName: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
}

export interface BookAvailability {
  totalCopies: number;
  availableCopies: number;
  canBorrow: boolean;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  meta?: {
    totalCount?: number;
    totalPages?: number;
  };
}

async function getApiData<T>(response: Response, message: string): Promise<{ data: T; meta?: ApiEnvelope<T>['meta'] }> {
  const result = await parseApiResponse<ApiEnvelope<T>>(response);
  if (!response.ok || !result?.success || result.data === undefined) {
    throw new Error(result?.error || `${message} (HTTP ${response.status}).`);
  }
  return { data: result.data, meta: result.meta };
}

export function useHomeCategories() {
  return useQuery({
    queryKey: ['public-home-categories'],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE_URL}/api/v1/categories`, { signal });
      const result = await getApiData<HomeCategory[]>(response, 'Không tải được danh mục sách');
      if (!Array.isArray(result.data)) throw new Error('Dữ liệu danh mục sách không hợp lệ.');
      return result.data;
    },
    staleTime: 60_000,
  });
}

export function useHomeBooks(categoryId: string, search: string, page: number) {
  return useQuery({
    queryKey: ['public-home-books', categoryId, search, page],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '18',
      });
      if (categoryId) params.set('categoryId', categoryId);
      if (search.trim()) params.set('search', search.trim());

      const response = await fetch(`${API_BASE_URL}/api/v1/books?${params}`, { signal });
      const result = await getApiData<HomeBook[]>(response, 'Không tải được đầu sách');
      if (!Array.isArray(result.data)) throw new Error('Dữ liệu đầu sách không hợp lệ.');
      return {
        books: result.data,
        totalCount: result.meta?.totalCount ?? result.data.length,
        totalPages: result.meta?.totalPages ?? 1,
      };
    },
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useHomeBookSuggestions(search: string) {
  const query = search.trim();
  return useQuery({
    queryKey: ['public-home-book-suggestions', query],
    enabled: query.length >= 2,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ page: '1', pageSize: '8', search: query });
      const response = await fetch(`${API_BASE_URL}/api/v1/books?${params}`, { signal });
      const result = await getApiData<HomeBook[]>(response, 'Không tải được gợi ý sách');
      if (!Array.isArray(result.data)) throw new Error('Dữ liệu gợi ý sách không hợp lệ.');
      return result.data;
    },
    staleTime: 30_000,
  });
}

export function useHomeBook(bookId: string) {
  return useQuery({
    queryKey: ['public-book-detail', bookId],
    enabled: Boolean(bookId),
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}`, { signal });
      const result = await getApiData<HomeBook>(response, 'Không tải được thông tin sách');
      return result.data;
    },
  });
}

export function useBookAvailability(bookId: string) {
  return useQuery({
    queryKey: ['public-book-availability', bookId],
    enabled: Boolean(bookId),
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}/availability`, { signal });
      const result = await getApiData<BookAvailability>(response, 'Không tải được trạng thái bản sao');
      return result.data;
    },
    refetchInterval: 30_000,
  });
}

export function useBookReviews(bookId: string, accessToken: string | null) {
  return useQuery({
    queryKey: ['public-book-reviews', bookId, accessToken ? 'authenticated' : 'anonymous'],
    enabled: Boolean(bookId),
    queryFn: async ({ signal }) => {
      const headers = new Headers();
      if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
      const response = await fetch(`${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}/reviews`, { headers, signal });
      const result = await getApiData<BookReview[]>(response, 'Không tải được đánh giá');
      if (!Array.isArray(result.data)) throw new Error('Dữ liệu đánh giá không hợp lệ.');
      return result.data;
    },
  });
}
