import { Link } from 'react-router-dom';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './HomeFooter.css';

const HomeFooter = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userRole = useAuthStore((state) => state.user?.role);

  return (
    <footer className="annual-footer">
      <div className="annual-frame annual-footer-grid">
        <div>
          <strong>Ghé thư viện</strong>
          <p>Tòa Alpha, Khu Công nghệ cao, TP. Thủ Đức, TP. Hồ Chí Minh</p>
        </div>
        <div>
          <strong>Khám phá</strong>
          <Link to="/books">Danh mục &amp; đầu sách</Link>
          <Link to="/news">Tin tức</Link>
          <Link to="/policies">Chính sách</Link>
        </div>
        <div className="annual-footer-hours">
          <strong>Thời gian</strong>
          <p><span>Thứ Hai – Thứ Sáu</span><span>07:00 – 19:00</span></p>
          <p><span>Thứ Bảy</span><span>07:00 – 17:00</span></p>
          <p><span>Chủ Nhật</span><span>Không phục vụ</span></p>
        </div>
        <div>
          <strong>Tài khoản</strong>
          {isAuthenticated ? (
            <>
              <Link to="/profile">Hồ sơ cá nhân</Link>
              {userRole === 'Reader' && (
                <>
                  <Link to="/support">Hỗ trợ</Link>
                  <Link to="/history">Lịch sử</Link>
                </>
              )}
            </>
          ) : (
            <>
              <Link to="/login">Đăng nhập</Link>
              <Link to="/register">Đăng ký</Link>
            </>
          )}
        </div>
      </div>
      <div className="annual-frame annual-footer-legal">
        <span>© 2026 FPT University HCMC</span>
        <span>Tri thức dành cho cộng đồng.</span>
      </div>
    </footer>
  );
};

export default HomeFooter;
