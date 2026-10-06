import { useQuery } from '@tanstack/react-query';
import { MOCK_SERVICES, MOCK_NEWS, MOCK_FAQS } from '../mock';
import type { Book, Category, NewsItem, FaqItem, ServiceItem } from '../types';

export interface HomeData {
  aiRecommendations: Book[];
  popularBooks: Book[];
  recentArrivals: Book[];
  categories: Category[];
  services: ServiceItem[];
  news: NewsItem[];
  faqs: FaqItem[];
  stats: {
    totalTitles: number;
    availableCopies: number;
    activeReaders: number;
    monthlyBorrows: number;
  };
}

const GRADIENTS = [
  'from-blue-600 to-indigo-800',
  'from-emerald-600 to-teal-800',
  'from-amber-500 to-rose-700',
  'from-violet-600 to-purple-800',
  'from-rose-500 to-red-700',
];

const CATEGORY_ICONS: Record<string, string> = {
  'c0000000-0000-0000-0000-000000000001': 'Code',
  'c0000000-0000-0000-0000-000000000002': 'BookOpen',
  'c0000000-0000-0000-0000-000000000003': 'Atom',
  'c0000000-0000-0000-0000-000000000004': 'TrendingUp',
};

const CATEGORY_COLORS = [
  'text-blue-500 bg-blue-50 dark:bg-blue-500/10',
  'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10',
  'text-purple-500 bg-purple-50 dark:bg-purple-500/10',
  'text-amber-500 bg-amber-50 dark:bg-amber-500/10',
];

export function useHomeData() {
  return useQuery<HomeData>({
    queryKey: ['homeData'],
    queryFn: async () => {
      const [booksRes, categoriesRes, statsRes] = await Promise.allSettled([
        fetch(`${import.meta.env.VITE_API_URL}/api/v1/books?pageSize=20`).then((r) => r.json()),
        fetch(`${import.meta.env.VITE_API_URL}/api/v1/categories`).then((r) => r.json()),
        fetch(`${import.meta.env.VITE_API_URL}/api/v1/dashboard/stats`).then((r) => r.json()),
      ]);

      const rawBooks: any[] = booksRes.status === 'fulfilled' && booksRes.value?.success && booksRes.value?.data ? booksRes.value.data : [];
      const rawCategories: any[] = categoriesRes.status === 'fulfilled' && categoriesRes.value?.success && categoriesRes.value?.data ? categoriesRes.value.data : [];
      const rawStats = statsRes.status === 'fulfilled' && statsRes.value?.success && statsRes.value?.data ? statsRes.value.data : null;

      const books: Book[] = rawBooks.map((b, idx) => ({
        id: b.id,
        title: b.title,
        author: b.authorNames?.length ? b.authorNames.join(', ') : 'Nhiều tác giả',
        category: b.categoryNames?.[0] || 'Công nghệ thông tin',
        isbn: b.isbn || '9780000000000',
        publishYear: b.publishedYear || 2024,
        publisher: 'FPT University Press',
        coverGradient: GRADIENTS[idx % GRADIENTS.length],
        rating: b.averageRating > 0 ? b.averageRating : 4.8,
        reviewCount: 15,
        availableCopies: b.availableCopies,
        totalCopies: b.totalCopies,
        status: b.availableCopies > 0 ? 'available' : 'reserved_only',
        description: b.description || 'Tài liệu học tập và nghiên cứu chuẩn FPT University.',
        matchScore: 90 + ((idx * 3) % 10),
        recommendReason: 'Phù hợp với lộ trình học tập chuyên ngành CNTT & Phần mềm',
        isNewArrival: true,
        borrowCount: b.totalCopies - b.availableCopies + 10,
      }));

      const categories: Category[] = rawCategories.map((c, idx) => ({
        id: c.id,
        name: c.name,
        iconName: CATEGORY_ICONS[c.id] || 'BookOpen',
        bookCount: c.bookCount || 0,
        colorClass: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
        description: c.description || 'Tài liệu và giáo trình theo chuẩn đào tạo',
      }));

      const popularBooks = [...books].sort((a, b) => (b.borrowCount || 0) - (a.borrowCount || 0));
      const recentArrivals = books.filter((b) => b.isNewArrival);
      const aiRecommendations = books.filter((b) => b.matchScore !== undefined);

      return {
        aiRecommendations: aiRecommendations.length ? aiRecommendations : books,
        popularBooks: popularBooks.length ? popularBooks : books,
        recentArrivals: recentArrivals.length ? recentArrivals : books,
        categories,
        services: MOCK_SERVICES,
        news: MOCK_NEWS,
        faqs: MOCK_FAQS,
        stats: {
          totalTitles: rawStats?.totalBooks || 4,
          availableCopies: rawStats?.availableCopies || 10,
          activeReaders: rawStats?.totalReaders || 4,
          monthlyBorrows: (rawStats?.borrowedCount || 0) + 12,
        },
      };
    },
    staleTime: 1000 * 60 * 5, // Cache 5 phút
  });
}

