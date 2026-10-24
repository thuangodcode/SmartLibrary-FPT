import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Globe2, MapPin, MessageSquareText, Star, UserRound } from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useToast } from '../../../components/ui/useToast';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { BookCover } from '../components/BookCover';
import HomeNavbar from '../components/HomeNavbar';
import { useBookAvailability, useBookReviews, useHomeBook, type BookReview } from '../hooks/useHomeData';
import './HomePage.css';
import './BookDetailPage.css';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface ReviewDraft {
  reviewId: string;
  rating: number;
  comment: string;
}

interface PickupSlot {
  pickupAt: string;
  remainingCapacity: number;
  capacity: number;
}

const BookDetailPage = () => {
  const { bookId = '' } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const { showToast } = useToast();
  const bookQuery = useHomeBook(bookId);
  const availabilityQuery = useBookAvailability(bookId);
  const reviewsQuery = useBookReviews(bookId, accessToken);
  const [draft, setDraft] = useState<ReviewDraft>({ reviewId: '', rating: 5, comment: '' });
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);
  const [selectedPickupAt, setSelectedPickupAt] = useState('');
  const [pickupSlotsError, setPickupSlotsError] = useState<string | null>(null);
  const [loadingPickupSlots, setLoadingPickupSlots] = useState(false);
  const book = bookQuery.data;
  const reviews = reviewsQuery.data ?? [];
  const myReview = reviews.find((review) => review.isMine);
  const draftSource = myReview?.id ?? 'new';
  const draftRating = draft.reviewId === draftSource ? draft.rating : myReview?.rating ?? 5;
  const draftComment = draft.reviewId === draftSource ? draft.comment : myReview?.comment ?? '';
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : book?.averageRating ?? 0;
  const isReader = user?.role === 'Reader';

  useEffect(() => {
    if (!isReader || !accessToken) return undefined;
    const controller = new AbortController();
    const loadPickupSlots = async () => {
      setLoadingPickupSlots(true);
      setPickupSlotsError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/me/circulation/pickup-slots`, {
          headers: { Authorization: ['Bearer', accessToken].join(' ') },
          signal: controller.signal,
        });
        const result = await parseApiResponse<ApiEnvelope<PickupSlot[]>>(response);
        if (!response.ok || !result?.success || !Array.isArray(result.data)) {
          throw new Error(result?.error || 'Không tải được lịch nhận sách.');
        }
        setPickupSlots(result.data);
        setSelectedPickupAt((current) => result.data?.some((slot) => slot.pickupAt === current)
          ? current
          : result.data?.[0]?.pickupAt ?? '');
      } catch (caught) {
        if (!controller.signal.aborted) {
          setPickupSlotsError(caught instanceof Error ? caught.message : 'Không tải được lịch nhận sách.');
        }
      } finally {
        if (!controller.signal.aborted) setLoadingPickupSlots(false);
      }
    };
    void loadPickupSlots();
    return () => controller.abort();
  }, [accessToken, isReader]);

  const invalidateBookData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['public-book-reviews', bookId] }),
      queryClient.invalidateQueries({ queryKey: ['public-book-detail', bookId] }),
      queryClient.invalidateQueries({ queryKey: ['public-home-books'] }),
    ]);
  };

  const borrowMutation = useMutation({
    mutationFn: async (pickupAt: string) => {
      if (!accessToken) throw new Error('Vui lòng đăng nhập bằng tài khoản độc giả để mượn sách.');
      const response = await fetch(`${API_BASE_URL}/api/v1/me/circulation/book-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ bookId, pickupAt }),
      });
      const result = await parseApiResponse<ApiEnvelope<unknown>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `Không gửi được yêu cầu mượn (HTTP ${response.status}).`);
      }
    },
    onSuccess: async (_data, pickupAt) => {
      showToast({ type: 'success', title: 'Đã gửi yêu cầu mượn', message: 'Bản sao đã được giữ cho bạn. Thủ thư sẽ tiếp nhận yêu cầu.' });
      await queryClient.invalidateQueries({ queryKey: ['public-book-availability', bookId] });
      setPickupSlots((slots) => slots
        .map((slot) => slot.pickupAt === pickupAt ? { ...slot, remainingCapacity: slot.remainingCapacity - 1 } : slot)
        .filter((slot) => slot.remainingCapacity > 0));
    },
    onError: (error) => showToast({ type: 'error', title: 'Không thể mượn sách', message: error.message }),
  });

  const reviewMutation = useMutation({
    mutationFn: async (payload: { method: 'POST' | 'PUT'; reviewId?: string; rating: number; comment: string }) => {
      if (!accessToken) throw new Error('Vui lòng đăng nhập bằng tài khoản độc giả để đánh giá.');
      const url = payload.reviewId
        ? `${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}/reviews/${encodeURIComponent(payload.reviewId)}`
        : `${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}/reviews`;
      const response = await fetch(url, {
        method: payload.method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ rating: payload.rating, comment: payload.comment }),
      });
      const result = await parseApiResponse<ApiEnvelope<BookReview>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `Không lưu được đánh giá (HTTP ${response.status}).`);
      }
      return result.data;
    },
    onSuccess: async (_review, variables) => {
      showToast({
        type: 'success',
        title: variables.method === 'POST' ? 'Đã gửi đánh giá' : 'Đã cập nhật đánh giá',
        message: 'Cảm ơn bạn đã chia sẻ cảm nhận về cuốn sách.',
      });
      await invalidateBookData();
    },
    onError: (error) => showToast({ type: 'error', title: 'Không thể lưu đánh giá', message: error.message }),
  });

  const deleteReviewMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      if (!accessToken) throw new Error('Vui lòng đăng nhập lại để quản lý đánh giá.');
      const response = await fetch(
        `${API_BASE_URL}/api/v1/books/${encodeURIComponent(bookId)}/reviews/${encodeURIComponent(reviewId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) {
        const result = await parseApiResponse<ApiEnvelope<unknown>>(response);
        throw new Error(result?.error || `Không xóa được đánh giá (HTTP ${response.status}).`);
      }
    },
    onSuccess: async () => {
      setDraft({ reviewId: 'new', rating: 5, comment: '' });
      showToast({ type: 'success', title: 'Đã xóa đánh giá', message: 'Đánh giá của bạn đã được gỡ khỏi sách.' });
      await invalidateBookData();
    },
    onError: (error) => showToast({ type: 'error', title: 'Không thể xóa đánh giá', message: error.message }),
  });

  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isReader) return;
    reviewMutation.mutate({
      method: myReview ? 'PUT' : 'POST',
      reviewId: myReview?.id,
      rating: draftRating,
      comment: draftComment.trim(),
    });
  };

  if (bookQuery.isPending) {
    return (
      <div className="annual-home annual-book-detail-page">
        <HomeNavbar activeSection="catalog" />
        <main className="book-detail-loading" aria-label="Đang tải thông tin sách">
          <div className="book-detail-cover-skeleton" />
          <div className="book-detail-copy-skeleton"><span /><span /><span /><span /></div>
        </main>
      </div>
    );
  }

  if (bookQuery.isError || !book) {
    return (
      <div className="annual-home annual-book-detail-page">
        <HomeNavbar activeSection="catalog" />
        <main className="book-detail-message" role="alert">
          <h1>Không tải được thông tin sách</h1>
          <p>{bookQuery.error?.message || 'Không tìm thấy đầu sách này.'}</p>
          <Link to="/books"><ArrowLeft size={16} /> Trở về khám phá sách</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="annual-home annual-book-detail-page">
      <HomeNavbar activeSection="catalog" />
      <main className="book-detail-main">
        <Link className="book-detail-back" to="/books"><ArrowLeft size={16} /> Khám phá sách</Link>

        <section className="book-detail-overview" aria-label="Thông tin sách">
          <div className="book-detail-visual">
            <BookCover
              title={book.title}
              author={book.authorNames.join(', ') || 'Chưa cập nhật tác giả'}
              category={book.categoryNames.join(' · ') || 'Chưa phân loại'}
              coverImageUrl={book.coverImageUrl}
              size="lg"
              className="book-detail-cover"
            />
            <div className="book-detail-cover-caption"><BookOpen size={15} /> Bộ sưu tập SmartLibrary</div>
          </div>

          <div className="book-detail-information">
            <h1>{book.title}</h1>
            <div className="book-detail-category">{book.categoryNames.join(' · ') || 'Tài liệu thư viện'}</div>
            <p className="book-detail-author"><UserRound size={17} /> {book.authorNames.join(', ') || 'Chưa cập nhật tác giả'}</p>
            <div className="book-detail-rating-summary">
              <span className="book-detail-stars" aria-label={`Đánh giá trung bình ${averageRating.toFixed(1)} trên 5`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star key={index} size={17} fill={index < Math.round(averageRating) ? 'currentColor' : 'none'} />
                ))}
              </span>
              <strong>{averageRating ? averageRating.toFixed(1) : 'Chưa có đánh giá'}</strong>
              <span>{reviews.length} đánh giá</span>
            </div>

            <div className="book-detail-copy-status" aria-live="polite">
              {availabilityQuery.isPending ? (
                <span>Đang kiểm tra bản sao…</span>
              ) : availabilityQuery.isError ? (
                <span className="is-unavailable">Không kiểm tra được trạng thái bản sao. {availabilityQuery.error.message}</span>
              ) : availabilityQuery.data?.canBorrow ? (
                <span className="is-available"><CheckCircle2 size={17} /> Sẵn sàng cho mượn · {availabilityQuery.data.availableCopies} bản</span>
              ) : (
                <span className="is-unavailable">Hiện không có bản sao sẵn sàng · {availabilityQuery.data?.totalCopies ?? 0} bản trong thư viện</span>
              )}
            </div>

            {isReader ? (
              <>
                <label className="book-detail-pickup-label" htmlFor="book-detail-pickup-time">Chọn giờ đến nhận sách</label>
                <select
                  id="book-detail-pickup-time"
                  className="book-detail-pickup-select"
                  value={selectedPickupAt}
                  disabled={loadingPickupSlots || pickupSlots.length === 0}
                  onChange={(event) => setSelectedPickupAt(event.target.value)}
                >
                  {pickupSlots.length === 0
                    ? <option value="">{loadingPickupSlots ? 'Đang tải khung giờ…' : 'Không còn khung giờ khả dụng'}</option>
                    : pickupSlots.map((slot) => (
                      <option key={slot.pickupAt} value={slot.pickupAt}>
                        {new Date(slot.pickupAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} · còn {slot.remainingCapacity}/{slot.capacity} lượt
                      </option>
                    ))}
                </select>
                {pickupSlotsError && <p className="book-detail-pickup-error" role="alert">{pickupSlotsError}</p>}
                <p className="book-detail-pickup-note">Thứ 2–6: 09:00–17:00 · Thứ 7: 09:00–15:00 · Khung 30 phút. Nếu không đến trong 30 phút sau lịch hẹn, yêu cầu và bản sao sẽ tự hủy.</p>
                <button
                  type="button"
                  className="book-detail-borrow"
                  disabled={!availabilityQuery.data?.canBorrow || availabilityQuery.isPending || availabilityQuery.isError || borrowMutation.isPending || !selectedPickupAt}
                  onClick={() => borrowMutation.mutate(selectedPickupAt)}
                >
                  {borrowMutation.isPending ? 'Đang gửi yêu cầu…' : 'Mượn sách'}
                </button>
              </>
            ) : user ? (
              <p className="book-detail-role-note">Tính năng mượn sách dành cho tài khoản độc giả.</p>
            ) : (
              <button type="button" className="book-detail-borrow" onClick={() => navigate('/login')}>Đăng nhập để mượn sách</button>
            )}

            <dl className="book-detail-facts">
              <div><dt><BookOpen size={16} /> Mã sách</dt><dd>{book.code || 'Chưa cập nhật'}</dd></div>
              <div><dt><UserRound size={16} /> Tác giả</dt><dd>{book.authorNames.join(', ') || 'Chưa cập nhật'}</dd></div>
              <div><dt><CalendarDays size={16} /> Năm xuất bản</dt><dd>{book.publishedYear || 'Chưa cập nhật'}</dd></div>
              <div><dt><Globe2 size={16} /> Ngôn ngữ</dt><dd>{book.language || 'Chưa cập nhật'}</dd></div>
              <div><dt><BookOpen size={16} /> ISBN</dt><dd>{book.isbn || 'Chưa cập nhật'}</dd></div>
              <div><dt><CheckCircle2 size={16} /> Tổng bản sao</dt><dd>{availabilityQuery.data?.totalCopies ?? book.totalCopies}</dd></div>
              {book.copyLocations !== undefined && (
                <div className="book-detail-fact-location">
                  <dt><MapPin size={16} /> Vị trí kệ</dt>
                  <dd>{book.copyLocations.join(' · ') || 'Chưa xếp kệ'}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        <section className="book-reviews-section" aria-labelledby="book-reviews-heading">
          <div className="book-reviews-heading">
            <div>
              <h2 id="book-reviews-heading">Đánh giá từ độc giả</h2>
              <p>Chia sẻ cảm nhận để giúp cộng đồng tìm thấy tài liệu phù hợp.</p>
            </div>
            <div className="book-reviews-score">
              <strong>{averageRating ? averageRating.toFixed(1) : '—'}</strong>
              <span>{reviews.length} đánh giá</span>
            </div>
          </div>

          {isReader && (
            <form className="book-review-form" onSubmit={submitReview}>
              <h3>{myReview ? 'Cập nhật đánh giá của bạn' : 'Viết đánh giá'}</h3>
              <label className="book-review-rating-label">Mức độ hài lòng</label>
              <div className="book-review-star-picker" role="radiogroup" aria-label="Chọn số sao">
                {Array.from({ length: 5 }, (_, index) => {
                  const value = index + 1;
                  return (
                    <button
                      type="button"
                      key={value}
                      role="radio"
                      aria-checked={draftRating === value}
                      aria-label={`${value} sao`}
                      onClick={() => setDraft({ reviewId: draftSource, rating: value, comment: draftComment })}
                    >
                      <Star size={27} fill={value <= draftRating ? 'currentColor' : 'none'} />
                    </button>
                  );
                })}
                <span>{draftRating} / 5</span>
              </div>
              <label htmlFor="book-review-comment">Nhận xét của bạn <span>(không bắt buộc)</span></label>
              <textarea
                id="book-review-comment"
                maxLength={2000}
                rows={4}
                placeholder="Cuốn sách này có hữu ích với bạn không?"
                value={draftComment}
                onChange={(event) => setDraft({ reviewId: draftSource, rating: draftRating, comment: event.target.value })}
              />
              <div className="book-review-form-footer">
                <span>{draftComment.length}/2000 ký tự</span>
                <div>
                  {myReview && (
                    <button type="button" className="book-review-delete" disabled={deleteReviewMutation.isPending} onClick={() => deleteReviewMutation.mutate(myReview.id)}>
                      Xóa đánh giá
                    </button>
                  )}
                  <button type="submit" disabled={reviewMutation.isPending}>
                    {reviewMutation.isPending ? 'Đang lưu…' : myReview ? 'Lưu thay đổi' : 'Gửi đánh giá'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {!isReader && !user && (
            <p className="book-review-signin"><Link to="/login">Đăng nhập với vai trò độc giả</Link> để đánh giá và bình luận.</p>
          )}
          {!isReader && user && <p className="book-review-signin">Đánh giá và bình luận dành cho tài khoản độc giả.</p>}

          {reviewsQuery.isPending ? (
            <div className="book-review-loading">Đang tải đánh giá…</div>
          ) : reviewsQuery.isError ? (
            <div className="book-review-error" role="alert">Không tải được đánh giá. {reviewsQuery.error.message}</div>
          ) : reviews.length ? (
            <div className="book-review-list">
              {reviews.map((review) => (
                <article className="book-review-item" key={review.id}>
                  <div className="book-review-avatar" aria-hidden="true">{review.readerName.trim().charAt(0).toLocaleUpperCase('vi')}</div>
                  <div className="book-review-content">
                    <div className="book-review-author">
                      <strong>{review.readerName}</strong>
                      {review.isMine && <span>Đánh giá của bạn</span>}
                      <time dateTime={review.updatedAt}>{new Date(review.updatedAt).toLocaleDateString('vi-VN')}</time>
                    </div>
                    <div className="book-review-item-stars" aria-label={`${review.rating} trên 5 sao`}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star key={index} size={14} fill={index < review.rating ? 'currentColor' : 'none'} />
                      ))}
                    </div>
                    {review.comment && <p>{review.comment}</p>}
                    {review.isMine && <button type="button" onClick={() => setDraft({ reviewId: review.id, rating: review.rating, comment: review.comment ?? '' })}>Chỉnh sửa đánh giá</button>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="book-review-empty"><MessageSquareText size={22} /><span>Chưa có đánh giá. Hãy là người đầu tiên chia sẻ cảm nhận.</span></div>
          )}
        </section>
      </main>
    </div>
  );
};

export default BookDetailPage;
