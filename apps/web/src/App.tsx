import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './features/home/pages/HomePage';
import LoginPage from './features/auth/pages/LoginPage';
import RegisterPage from './features/auth/pages/RegisterPage';
import VerifyEmailPage from './features/auth/pages/VerifyEmailPage';
import ForgotPasswordPage from './features/auth/pages/ForgotPasswordPage';
import ResetPasswordPage from './features/auth/pages/ResetPasswordPage';
import ForbiddenPage from './features/auth/pages/ForbiddenPage';
import { RoleGuard } from './features/auth/components/RoleGuard';
import { LibrarianLayout } from './features/librarian/components/LibrarianLayout';
import LibrarianDashboard from './features/librarian/pages/LibrarianDashboard';
import RegistrationApprovalPage from './features/librarian/pages/RegistrationApprovalPage';
import ReadersManagementPage from './features/librarian/pages/ReadersManagementPage';
import { useAuthStore } from './features/auth/store/useAuthStore';

function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      {/* Librarian Routes */}
      <Route path="/librarian" element={
        <RoleGuard allowedRoles={['Librarian', 'Admin']}>
          <LibrarianLayout />
        </RoleGuard>
      }>
        <Route index element={<LibrarianDashboard />} />
        <Route path="registrations" element={<RegistrationApprovalPage />} />
        <Route path="readers" element={<ReadersManagementPage />} />
      </Route>

      {/* Admin Routes (placeholder) */}
      <Route path="/admin" element={
        <RoleGuard allowedRoles={['Admin']}>
          <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Dashboard</h1>
              <p className="text-sm text-slate-500 mt-2">Coming soon...</p>
            </div>
          </div>
        </RoleGuard>
      } />
    </Routes>
  );
}

export default App;
