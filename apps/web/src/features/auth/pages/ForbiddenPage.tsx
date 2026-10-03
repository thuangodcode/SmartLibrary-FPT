import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-[#0B0F17] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="font-serif font-bold text-2xl text-slate-900 dark:text-white">
            403 - Không Có Quyền Truy Cập
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Rất tiếc, tài khoản của bạn không có đủ quyền hạn RBAC để thực hiện hành động này hoặc truy cập khu vực quản trị.
          </p>
        </div>

        <button
          onClick={() => navigate('/')}
          className="w-full py-3 rounded-2xl bg-slate-900 dark:bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về Trang Chủ SmartLibrary</span>
        </button>
      </div>
    </div>
  );
};

export default ForbiddenPage;
