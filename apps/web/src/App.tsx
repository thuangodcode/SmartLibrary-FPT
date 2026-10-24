import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './features/home/pages/HomePage';
import HomeCatalogPage from './features/home/pages/HomeCatalogPage';
import BookDetailPage from './features/home/pages/BookDetailPage';
import HomeInfoPage from './features/home/pages/HomeInfoPage';
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
import LibrarianReportsPage from './features/librarian/pages/LibrarianReportsPage';
import LibrarianReportDetailPage from './features/librarian/pages/LibrarianReportDetailPage';
import LibrarianModulePage from './features/librarian/pages/LibrarianModulePage';
import LibrarianAiPage from './features/librarian/pages/LibrarianAiPage';
import AdminAiSettingsPage from './features/admin/pages/AdminAiSettingsPage';
import LibrarianCategoriesPage from './features/librarian/pages/LibrarianCategoriesPage';
import LibrarianCreateCategoryPage from './features/librarian/pages/LibrarianCreateCategoryPage';
import LibrarianCategoryBooksPage from './features/librarian/pages/LibrarianCategoryBooksPage';
import LibrarianBookDetailPage from './features/librarian/pages/LibrarianBookDetailPage';
import CirculationPage, { DirectCheckoutPage } from './features/librarian/pages/CirculationPage';
import { AdminLayout } from './features/admin/components/AdminLayout';
import AdminOverviewPage from './features/admin/pages/AdminOverviewPage';
import AdminSectionPage from './features/admin/pages/AdminSectionPage';
import AdminUsersPage from './features/admin/pages/AdminUsersPage';
import AdminLibrarianCreatePage from './features/admin/pages/AdminLibrarianCreatePage';
import AdminUserDetailPage from './features/admin/pages/AdminUserDetailPage';
import AdminPoliciesPage from './features/admin/pages/AdminPoliciesPage';
import AdminReportsPage from './features/admin/pages/AdminReportsPage';
import AdminCollectionPage from './features/admin/pages/AdminCollectionPage';
import AdminReportDetailPage from './features/admin/pages/AdminReportDetailPage';
import AdminReportTemplatesPage from './features/admin/pages/AdminReportTemplatesPage';
import AdminReportTemplateDetailPage from './features/admin/pages/AdminReportTemplateDetailPage';
import AdminRegulationsPage from './features/admin/pages/AdminRegulationsPage';
import ProfilePage from './features/profile/pages/ProfilePage';
import HistoryPage from './features/profile/pages/HistoryPage';
import SupportPage from './features/profile/pages/SupportPage';
import LibrarianSupportPage from './features/librarian/pages/LibrarianSupportPage';
import { useAuthStore } from './features/auth/store/useAuthStore';

function ProfileEntry() {
  const role = useAuthStore((state) => state.user?.role);
  if (role === 'Admin') return <Navigate to="/admin/profile" replace />;
  if (role === 'Librarian') return <Navigate to="/librarian/profile" replace />;
  return <ProfilePage />;
}

function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/books" element={<HomeCatalogPage />} />
      <Route path="/books/:bookId" element={<BookDetailPage />} />
      <Route path="/services" element={<Navigate to="/books" replace />} />
      <Route path="/news" element={<HomeInfoPage section="news" />} />
      <Route path="/policies" element={<HomeInfoPage section="policies" />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/profile" element={
        <RoleGuard allowedRoles={['Admin', 'Librarian', 'Reader']}>
          <ProfileEntry />
        </RoleGuard>
      } />
      <Route path="/history" element={
        <RoleGuard allowedRoles={['Reader']}>
          <HistoryPage />
        </RoleGuard>
      } />
      <Route path="/support" element={
        <RoleGuard allowedRoles={['Reader']}>
          <SupportPage />
        </RoleGuard>
      } />

      {/* Librarian Routes */}
      <Route path="/librarian" element={
        <RoleGuard allowedRoles={['Librarian']}>
          <LibrarianLayout />
        </RoleGuard>
      }>
        <Route index element={<LibrarianDashboard />} />
        <Route path="registrations" element={<RegistrationApprovalPage />} />
        <Route path="readers" element={<ReadersManagementPage />} />
        <Route path="readers/:userId" element={<AdminUserDetailPage audience="librarian" />} />
        <Route path="books" element={<LibrarianCategoriesPage />} />
        <Route path="books/categories/new" element={<LibrarianCreateCategoryPage />} />
        <Route path="books/categories/:categoryId" element={<LibrarianCategoryBooksPage />} />
        <Route path="books/:bookId" element={<LibrarianBookDetailPage />} />
        <Route path="copies" element={<Navigate to="/librarian/books?view=copies" replace />} />
        <Route path="loans" element={<LibrarianModulePage />} />
        <Route path="fines" element={<LibrarianModulePage />} />
        <Route path="ai-settings" element={<LibrarianAiPage />} />
        <Route path="ai-recommendations" element={<Navigate to="/librarian/ai-settings" replace />} />
        <Route path="circulation" element={<Navigate to="/librarian/circulation/loans" replace />} />
        <Route path="circulation/direct-borrow" element={<DirectCheckoutPage />} />
        <Route path="circulation/:tab" element={<CirculationPage />} />
        <Route path="reports" element={<LibrarianReportsPage />} />
        <Route path="reports/new" element={<LibrarianReportsPage />} />
        <Route path="reports/:id" element={<LibrarianReportDetailPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="support/requests" element={<LibrarianSupportPage view="requests" />} />
        <Route path="support/replies" element={<LibrarianSupportPage view="replies" />} />
      </Route>

      {/* Admin Routes */}
      <Route path="/admin" element={
        <RoleGuard allowedRoles={['Admin']}>
          <AdminLayout />
        </RoleGuard>
      }>
        <Route index element={<AdminOverviewPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="users/create-librarian" element={<AdminLibrarianCreatePage />} />
        <Route path="users/:userId" element={<AdminUserDetailPage />} />
        <Route path="books" element={<AdminSectionPage title="Quản lý sách" />} />
        <Route path="collection" element={<AdminCollectionPage />} />
        <Route path="collection/:categoryId" element={<AdminCollectionPage />} />
        <Route path="policies" element={<AdminPoliciesPage />} />
        <Route path="policies/create" element={<AdminPoliciesPage mode="create" />} />
        <Route path="policies/:policyCode/edit" element={<AdminPoliciesPage mode="edit" />} />
        <Route path="policies/:policyCode" element={<AdminPoliciesPage mode="view" />} />
        <Route path="regulations" element={<AdminRegulationsPage />} />
        <Route path="regulations/create" element={<AdminRegulationsPage mode="create" />} />
        <Route path="regulations/:regulationId/edit" element={<AdminRegulationsPage mode="edit" />} />
        <Route path="regulations/:regulationId" element={<AdminRegulationsPage mode="view" />} />
        <Route path="ai-settings" element={<AdminAiSettingsPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="reports/assignments" element={<AdminReportsPage />} />
        <Route path="reports/activity" element={<AdminReportsPage />} />
        <Route path="reports/finance" element={<AdminReportsPage />} />
        <Route path="reports/collection" element={<Navigate to="/admin/collection" replace />} />
        <Route path="reports/periodic" element={<AdminReportsPage />} />
        <Route path="reports/library" element={<AdminReportsPage />} />
        <Route path="reports/templates" element={<AdminReportTemplatesPage />} />
        <Route path="reports/templates/:templateId" element={<AdminReportTemplateDetailPage />} />
        <Route path="reports/:id" element={<AdminReportDetailPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
