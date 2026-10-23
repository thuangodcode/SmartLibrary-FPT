import { ArrowRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MOCK_FAQS, MOCK_NEWS, MOCK_SERVICES } from '../mock';
import HomeNavbar from '../components/HomeNavbar';
import './HomePage.css';
import './HomeInfoPage.css';

type HomeInfoSection = 'services' | 'news' | 'policies';

const pageCopy: Record<HomeInfoSection, { title: string; description: string }> = {
  services: {
    title: 'Dịch vụ thư viện',
    description: 'Các tiện ích giúp bạn tra cứu, mượn và quản lý tài liệu trong quá trình học tập.',
  },
  news: {
    title: 'Tin tức & Thông báo',
    description: 'Cập nhật những thông tin mới nhất từ SmartLibrary và thư viện FPT.',
  },
  policies: {
    title: 'Chính sách & Quy định',
    description: 'Thông tin hướng dẫn về việc sử dụng tài liệu và các dịch vụ thư viện.',
  },
};

const HomeInfoPage: React.FC<{ section: HomeInfoSection }> = ({ section }) => {
  const { title, description } = pageCopy[section];

  return (
    <div className="annual-home annual-info-page">
      <HomeNavbar activeSection={section} />

      <main className="annual-info-main">
        <header className="annual-info-heading">
          <p>SMARTLIBRARY · FPT UNIVERSITY</p>
          <h1>{title}</h1>
          <span>{description}</span>
        </header>

        {section === 'services' && (
          <section className="annual-info-service-grid" aria-label="Danh sách dịch vụ">
            {MOCK_SERVICES.map((service, index) => (
              <article className={`annual-info-service annual-info-service--${index + 1}`} key={service.id}>
                <span>{service.badge || 'Dịch vụ thư viện'}</span>
                <BookOpen size={22} aria-hidden="true" />
                <h2>{service.title}</h2>
                <p>{service.description}</p>
                <Link to="/login">Đăng nhập để sử dụng <ArrowRight size={16} /></Link>
              </article>
            ))}
          </section>
        )}

        {section === 'news' && (
          <section className="annual-info-news-list" aria-label="Danh sách tin tức">
            {MOCK_NEWS.map((item) => (
              <article className="annual-info-news-item" key={item.id}>
                <div><span>{item.category}</span><time>{item.date}</time></div>
                <h2>{item.title}</h2>
                <p>{item.summary}</p>
                <small>{item.readTime}</small>
              </article>
            ))}
          </section>
        )}

        {section === 'policies' && (
          <section className="annual-info-policy-list" aria-label="Các chính sách và quy định">
            {MOCK_FAQS.map((item, index) => (
              <article className="annual-info-policy-item" key={item.id}>
                <span>0{index + 1} · {item.category}</span>
                <h2>{item.question}</h2>
                <p>{item.answer}</p>
              </article>
            ))}
          </section>
        )}
      </main>

      <footer className="annual-info-footer">
        <Link to="/">SmartLibrary</Link>
        <nav aria-label="Liên kết cuối trang">
          <Link to="/services">Dịch vụ</Link>
          <Link to="/news">Tin tức</Link>
          <Link to="/policies">Chính sách</Link>
        </nav>
        <span>© 2026 FPT University HCMC</span>
      </footer>
    </div>
  );
};

export default HomeInfoPage;
