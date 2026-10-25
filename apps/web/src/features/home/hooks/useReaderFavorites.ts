import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import type { HomeBook } from './useHomeData';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

const favoritesQueryKey = (accessToken: string | null) => ['reader-favorites', accessToken];

async function requestFavoriteBooks(accessToken: string, signal?: AbortSignal): Promise<HomeBook[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/me/favorites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  const result = await parseApiResponse<ApiEnvelope<HomeBook[]>>(response);
  if (!response.ok || !result?.success || !Array.isArray(result.data)) {
    throw new Error(result?.error || `Không tải được danh sách yêu thích (HTTP ${response.status}).`);
  }
  return result.data;
}

export function useReaderFavorites() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isReader = useAuthStore((state) => state.user?.role === 'Reader');

  return useQuery({
    queryKey: favoritesQueryKey(accessToken),
    enabled: isReader && Boolean(accessToken),
    queryFn: ({ signal }) => {
      if (!accessToken) throw new Error('Vui lòng đăng nhập bằng tài khoản độc giả.');
      return requestFavoriteBooks(accessToken, signal);
    },
  });
}

export function useToggleReaderFavorite(bookId: string) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isFavorite: boolean) => {
      if (!accessToken) throw new Error('Vui lòng đăng nhập bằng tài khoản độc giả.');
      const response = await fetch(`${API_BASE_URL}/api/v1/me/favorites/${encodeURIComponent(bookId)}`, {
        method: isFavorite ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 204) return;
      const result = await parseApiResponse<ApiEnvelope<boolean>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `Không cập nhật được yêu thích (HTTP ${response.status}).`);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: favoritesQueryKey(accessToken) });
    },
  });
}
