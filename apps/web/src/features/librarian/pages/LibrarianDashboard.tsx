import React, { useState, useEffect } from 'react';
import { Users, BookOpen, FileCheck, AlertTriangle, Loader2, BookCopy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../auth/store/useAuthStore';

interface DashboardStats {
  pendingRegistrations: number;
  totalReaders: number;
  totalBooks: number;
  availableCopies: number;
  borrowedCount: number;
  overdueCount: number;
}

const LibrarianDashboard: React.FC = () => {
  const [statsData, setStatsData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const res = await fetch('http://localhost:5278/api/v1/dashboard/stats', { headers });
        const json = await res.json();
        if (json.success && json.data) {
          setStatsData(json.data);
        }
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [accessToken]);

  const cards = [
    {
      label: 'Đơn chờ duyệt',
      value: statsData ? statsData.pendingRegistrations.toLocaleString() : '...',
      icon: FileCheck,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10',
      link: '/librarian/registrations'
    },
    {
      label: 'Tổng độc giả',
      value: statsData ? statsData.totalReaders.toLocaleString() : '...',
      icon: Users,
      color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10',
      link: '/librarian/readers'
    },
    {
      label: 'Tổng đầu sách',
      value: statsData ? statsData.totalBooks.toLocaleString() : '...',
      icon: BookOpen,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10',
      link: '/librarian/books'
    },
    {
      label: 'Bản sao sẵn sàng',
      value: statsData ? statsData.availableCopies.toLocaleString() : '...',
      icon: BookCopy,
      color: 'text-sky-600 bg-sky-50 dark:bg-sky-500/10',
      link: '/librarian/books'
    },
    {
      label: 'Sách đang mượn',
      value: statsData ? statsData.borrowedCount.toLocaleString() : '...',
      icon: BookOpen,
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-500/10'
    },
    {
      label: 'Quá hạn',
      value: statsData ? statsData.overdueCount.toLocaleString() : '...',
      icon: AlertTriangle,
      color: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10'
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Bảng Điều Khiển Thủ Thư</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Dữ liệu thời gian thực từ cơ sở dữ liệu thư viện</p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-indigo-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Đang cập nhật...</span>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center`}>
                <stat.icon className="w-5 h-5" />
              </div>
              {stat.link && (
                <Link to={stat.link} className="text-[10px] font-bold text-indigo-600 hover:underline">Chi tiết →</Link>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
            <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Hành Động Nhanh</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/librarian/registrations" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all">
            <FileCheck className="w-6 h-6 text-indigo-600" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Duyệt Tài Khoản</span>
          </Link>
          <Link to="/librarian/books" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all">
            <BookOpen className="w-6 h-6 text-emerald-600" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Quản Lý Sách</span>
          </Link>
          <Link to="/librarian/readers" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all">
            <Users className="w-6 h-6 text-purple-600" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Quản Lý Độc Giả</span>
          </Link>
          <Link to="/librarian/settings" className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Cài Đặt Hệ Thống</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LibrarianDashboard;

