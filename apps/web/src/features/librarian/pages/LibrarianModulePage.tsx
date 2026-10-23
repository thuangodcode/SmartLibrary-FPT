import { useLocation } from 'react-router-dom';
import {
  AlarmClock,
  Archive,
  ArrowLeftRight,
  BookOpen,
  Sparkles,
} from 'lucide-react';

const modules: Record<string, { title: string; description: string; icon: typeof BookOpen }> = {
  books: {
    title: 'Sách & Biên mục',
    description: 'Quản lý danh mục sách và thông tin biên mục.',
    icon: BookOpen,
  },
  copies: {
    title: 'Bản sao & Kho',
    description: 'Theo dõi bản sao sách, vị trí lưu trữ và tình trạng kho.',
    icon: Archive,
  },
  loans: {
    title: 'Mượn – Trả',
    description: 'Quản lý quy trình mượn và trả sách.',
    icon: ArrowLeftRight,
  },
  fines: {
    title: 'Quá hạn & Phí phạt',
    description: 'Theo dõi sách quá hạn và các khoản phí phạt.',
    icon: AlarmClock,
  },
  'ai-recommendations': {
    title: 'Gợi ý nhập sách AI',
    description: 'Tham khảo gợi ý bổ sung đầu sách cho thư viện.',
    icon: Sparkles,
  },
};

const LibrarianModulePage: React.FC = () => {
  const { pathname } = useLocation();
  const moduleKey = pathname.split('/').filter(Boolean).at(-1) ?? '';
  const module = modules[moduleKey];

  if (!module) return null;
  const Icon = module.icon;

  return (
    <section className="lib-module-page">
      <header className="lib-module-heading">
        <span className="lib-module-icon"><Icon size={22} /></span>
        <div>
          <p>KHÔNG GIAN THỦ THƯ</p>
          <h1>{module.title}</h1>
          <span>{module.description}</span>
        </div>
      </header>
      <div className="lib-module-empty">
        <strong>Khu vực {module.title.toLowerCase()}</strong>
        <p>Chức năng đang được hoàn thiện và sẽ sớm được cập nhật.</p>
      </div>
    </section>
  );
};

export default LibrarianModulePage;
