import { FolderOpen } from 'lucide-react';
import './AdminSectionPage.css';

interface AdminSectionPageProps {
  title: string;
}

const AdminSectionPage: React.FC<AdminSectionPageProps> = ({ title }) => (
  <section className="admin-section-page">
    <header className="admin-section-heading">
      <div>
        <span className="admin-section-eyebrow">QUẢN TRỊ HỆ THỐNG</span>
        <h1>{title}</h1>
        <p>Khu vực quản lý đã sẵn sàng để bổ sung dữ liệu và chức năng.</p>
      </div>
    </header>

    <div className="admin-section-empty">
      <span className="admin-section-empty-icon"><FolderOpen size={23} /></span>
      <h2>Chưa có dữ liệu</h2>
      <p>Bạn có thể thêm nội dung cho mục này sau.</p>
    </div>
  </section>
);

export default AdminSectionPage;
