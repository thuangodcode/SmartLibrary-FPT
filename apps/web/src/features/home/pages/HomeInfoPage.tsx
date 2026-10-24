import { Link } from 'react-router-dom';
import { MOCK_FAQS, MOCK_NEWS } from '../mock';
import HomeNavbar from '../components/HomeNavbar';
import './HomePage.css';
import './HomeInfoPage.css';

type HomeInfoSection = 'news' | 'policies';

const pageCopy: Record<HomeInfoSection, { title: string; description: string }> = {
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
          <Link to="/news">Tin tức</Link>
          <Link to="/policies">Chính sách</Link>
        </nav>
        <span>© 2026 FPT University HCMC</span>
      </footer>
    </div>
  );
};

export default HomeInfoPage;
