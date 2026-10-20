import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
import { AdminLayout } from './features/admin/components/AdminLayout';
import AdminOverviewPage from './features/admin/pages/AdminOverviewPage';
import AdminSectionPage from './features/admin/pages/AdminSectionPage';
import AdminUsersPage from './features/admin/pages/AdminUsersPage';
import AdminPoliciesPage from './features/admin/pages/AdminPoliciesPage';
import AdminPolicyDetailPage from './features/admin/pages/AdminPolicyDetailPage';
import AdminPolicyFormPage from './features/admin/pages/AdminPolicyFormPage';
import AdminRegulationsPage from './features/admin/pages/AdminRegulationsPage';
import AdminRegulationDetailPage from './features/admin/pages/AdminRegulationDetailPage';
import AdminRegulationFormPage from './features/admin/pages/AdminRegulationFormPage';
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
        <RoleGuard allowedRoles={['Librarian']}>
          <LibrarianLayout />
        </RoleGuard>
      }>
        <Route index element={<LibrarianDashboard />} />
        <Route path="registrations" element={<RegistrationApprovalPage />} />
        <Route path="readers" element={<ReadersManagementPage />} />
      </Route>

      {/* Admin Routes */}
      <Route path="/admin" element={
        <RoleGuard allowedRoles={['Admin']}>
          <AdminLayout />
        </RoleGuard>
      }>
        <Route index element={<AdminOverviewPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="books" element={<AdminSectionPage title="Quản lý sách" />} />
        <Route path="policies" element={<AdminPoliciesPage />} />
        <Route path="policies/create" element={<AdminPolicyFormPage mode="create" />} />
        <Route path="policies/:policyCode/edit" element={<AdminPolicyFormPage mode="edit" />} />
        <Route path="policies/:policyCode" element={<AdminPolicyDetailPage />} />
        <Route path="regulations" element={<AdminRegulationsPage />} />
        <Route path="regulations/create" element={<AdminRegulationFormPage mode="create" />} />
        <Route path="regulations/:regulationId/edit" element={<AdminRegulationFormPage mode="edit" />} />
        <Route path="regulations/:regulationId" element={<AdminRegulationDetailPage />} />
        <Route path="ai-settings" element={<AdminSectionPage title="Cấu hình AI" />} />
        <Route path="reports" element={<AdminSectionPage title="Thống kê & báo cáo" />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
