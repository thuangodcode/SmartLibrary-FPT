import React from 'react';
import { AnnouncementBar } from '../../../components/layout/AnnouncementBar';
import { Header } from '../../../components/layout/Header';
import { Footer } from '../../../components/layout/Footer';
import { HeroSection } from '../components/HeroSection';
import { QuickServices } from '../components/QuickServices';
import { AiRecommendations } from '../components/AiRecommendations';
import { CategoryGrid } from '../components/CategoryGrid';
import { FeaturedBooks } from '../components/FeaturedBooks';
import { HowItWorks } from '../components/HowItWorks';
import { FeatureHighlights } from '../components/FeatureHighlights';
import { LibraryInfo } from '../components/LibraryInfo';
import { NewsSection } from '../components/NewsSection';
import { FaqSection } from '../components/FaqSection';
import { CtaBanner } from '../components/CtaBanner';
import { useHomeData } from '../hooks/useHomeData';

export const HomePage: React.FC = () => {
  const { data, isLoading, isError } = useHomeData();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between">
        <AnnouncementBar />
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-24 w-full space-y-8 animate-pulse">
          <div className="h-12 bg-slate-200 dark:bg-slate-800 rounded-2xl w-3/4 mx-auto" />
          <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-xl w-1/2 mx-auto" />
          <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-3xl max-w-2xl mx-auto" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-12">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-64 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
            ))}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between">
        <Header />
        <div className="max-w-md mx-auto my-auto p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-xl text-center space-y-4 border border-slate-200 dark:border-slate-800">
          <h3 className="font-serif font-bold text-xl text-slate-900 dark:text-white">
            Không thể tải dữ liệu trang chủ
          </h3>
          <p className="text-xs text-slate-500">Vui lòng kiểm tra kết nối mạng và thử lại.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold"
          >
            Tải lại trang
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex flex-col justify-between">
      <AnnouncementBar />
      <Header />

      <main className="flex-grow">
        <HeroSection stats={data.stats} />

        <div id="services">
          <QuickServices services={data.services} />
        </div>

        <div id="ai-recommend">
          <AiRecommendations books={data.aiRecommendations} />
        </div>

        <div id="categories">
          <CategoryGrid categories={data.categories} />
        </div>

        <FeaturedBooks
          popularBooks={data.popularBooks}
          recentArrivals={data.recentArrivals}
          aiRecommendations={data.aiRecommendations}
        />

        <HowItWorks />

        <FeatureHighlights />

        <LibraryInfo />

        <div id="news">
          <NewsSection news={data.news} />
        </div>

        <FaqSection faqs={data.faqs} />

        <CtaBanner />
      </main>

      <Footer />
    </div>
  );
};

export default HomePage;
