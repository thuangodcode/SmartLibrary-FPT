import { Heart } from 'lucide-react';
import { useToast } from '../../../components/ui/useToast';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useReaderFavorites, useToggleReaderFavorite } from '../hooks/useReaderFavorites';

interface FavoriteBookButtonProps {
  bookId: string;
  title: string;
  variant?: 'card' | 'detail';
}

export default function FavoriteBookButton({
  bookId,
  title,
  variant = 'card',
}: FavoriteBookButtonProps) {
  const isReader = useAuthStore((state) => state.user?.role === 'Reader');
  const favoritesQuery = useReaderFavorites();
  const toggleFavorite = useToggleReaderFavorite(bookId);
  const { showToast } = useToast();

  if (!isReader) return null;

  const isFavorite = favoritesQuery.data?.some((book) => book.id === bookId) ?? false;
  const label = isFavorite ? 'Xóa khỏi danh sách yêu thích' : 'Thêm danh sách yêu thích';
  const disabled = favoritesQuery.isPending || favoritesQuery.isError || toggleFavorite.isPending;

  const handleClick = () => {
    toggleFavorite.mutate(isFavorite, {
      onSuccess: () => showToast({
        type: 'success',
        title: isFavorite ? 'Đã xóa khỏi yêu thích' : 'Đã thêm vào yêu thích',
        message: `“${title}” ${isFavorite ? 'đã được xóa khỏi' : 'đã được thêm vào'} danh sách yêu thích.`,
      }),
      onError: (error) => showToast({
        type: 'error',
        title: 'Không thể cập nhật yêu thích',
        message: error.message,
      }),
    });
  };

  return (
    <button
      type="button"
      className={`favorite-book-button favorite-book-button--${variant}${isFavorite ? ' is-favorite' : ''}`}
      onClick={handleClick}
      disabled={disabled}
      aria-label={`${label}: ${title}`}
      aria-pressed={isFavorite}
      title={favoritesQuery.isError ? 'Không tải được danh sách yêu thích.' : label}
    >
      <Heart aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
      {variant === 'detail' && <span>{toggleFavorite.isPending ? 'Đang cập nhật…' : label}</span>}
    </button>
  );
}
