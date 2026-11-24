import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import PageLoading from './components/ui/PageLoading';
import { RoleGuard } from './features/auth/components/RoleGuard';
import { useAuthStore } from './features/auth/store/useAuthStore';

// Keep each screen out of the initial bundle until its route is opened.
const HomePage = lazy(() => import('./features/home/pages/HomePage'));
const HomeCatalogPage = lazy(() => import('./features/home/pages/HomeCatalogPage'));
const BookDetailPage = lazy(() => import('./features/home/pages/BookDetailPage'));
const HomeInfoPage = lazy(() => import('./features/home/pages/HomeInfoPage'));
const NewsArticleDetailPage = lazy(() => import('./features/home/pages/NewsArticleDetailPage'));
const RagAskPanel = lazy(() => import('./features/home/components/RagAskPanel'));
const LoginPage = lazy(() => import('./features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('./features/auth/pages/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./features/auth/pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./features/auth/pages/ResetPasswordPage'));
const ForbiddenPage = lazy(() => import('./features/auth/pages/ForbiddenPage'));
const LibrarianLayout = lazy(() => import('./features/librarian/components/LibrarianLayout').then((m) => ({ default: m.LibrarianLayout })));
const LibrarianDashboard = lazy(() => import('./features/librarian/pages/LibrarianDashboard'));
const RegistrationApprovalPage = lazy(() => import('./features/librarian/pages/RegistrationApprovalPage'));
const ReadersManagementPage = lazy(() => import('./features/librarian/pages/ReadersManagementPage'));
const LibrarianReportsPage = lazy(() => import('./features/librarian/pages/LibrarianReportsPage'));
const LibrarianReportDetailPage = lazy(() => import('./features/librarian/pages/LibrarianReportDetailPage'));
const LibrarianModulePage = lazy(() => import('./features/librarian/pages/LibrarianModulePage'));
const LibrarianAiPage = lazy(() => import('./features/librarian/pages/LibrarianAiPage'));
const AdminAiSettingsPage = lazy(() => import('./features/admin/pages/AdminAiSettingsPage'));
const LibrarianCategoriesPage = lazy(() => import('./features/librarian/pages/LibrarianCategoriesPage'));
const LibrarianCopiesPage = lazy(() => import('./features/librarian/pages/LibrarianCopiesPage'));
const LibrarianCreateCategoryPage = lazy(() => import('./features/librarian/pages/LibrarianCreateCategoryPage'));
const LibrarianCategoryBooksPage = lazy(() => import('./features/librarian/pages/LibrarianCategoryBooksPage'));
const LibrarianBookDetailPage = lazy(() => import('./features/librarian/pages/LibrarianBookDetailPage'));
const LibrarianNewsPage = lazy(() => import('./features/librarian/pages/LibrarianNewsPage'));
const CirculationPage = lazy(() => import('./features/librarian/pages/CirculationPage'));
const CirculationIncidentDetailPage = lazy(() => import('./features/librarian/pages/CirculationPage').then((m) => ({ default: m.CirculationIncidentDetailPage })));
const DirectCheckoutPage = lazy(() => import('./features/librarian/pages/CirculationPage').then((m) => ({ default: m.DirectCheckoutPage })));
const AdminLayout = lazy(() => import('./features/admin/components/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminOverviewPage = lazy(() => import('./features/admin/pages/AdminOverviewPage'));
const AdminSectionPage = lazy(() => import('./features/admin/pages/AdminSectionPage'));
const AdminUsersPage = lazy(() => import('./features/admin/pages/AdminUsersPage'));
const AdminLibrarianCreatePage = lazy(() => import('./features/admin/pages/AdminLibrarianCreatePage'));
const AdminUserDetailPage = lazy(() => import('./features/admin/pages/AdminUserDetailPage'));
const AdminPoliciesPage = lazy(() => import('./features/admin/pages/AdminPoliciesPage'));
const AdminReportsPage = lazy(() => import('./features/admin/pages/AdminReportsPage'));
const AdminCollectionPage = lazy(() => import('./features/admin/pages/AdminCollectionPage'));
const AdminReportDetailPage = lazy(() => import('./features/admin/pages/AdminReportDetailPage'));
const AdminReportTemplatesPage = lazy(() => import('./features/admin/pages/AdminReportTemplatesPage'));
const AdminReportTemplateDetailPage = lazy(() => import('./features/admin/pages/AdminReportTemplateDetailPage'));
const AdminRegulationsPage = lazy(() => import('./features/admin/pages/AdminRegulationsPage'));
const ProfilePage = lazy(() => import('./features/profile/pages/ProfilePage'));
const HistoryPage = lazy(() => import('./features/profile/pages/HistoryPage'));
const ReaderFavoritesPage = lazy(() => import('./features/home/pages/ReaderFavoritesPage'));
const SupportPage = lazy(() => import('./features/profile/pages/SupportPage'));
const LibrarianSupportPage = lazy(() => import('./features/librarian/pages/LibrarianSupportPage'));
const PinnedNewsPoster = lazy(() => import('./features/home/components/PinnedNewsPoster'));

function ProfileEntry() {
  const role = useAuthStore((state) => state.user?.role);
  if (role === 'Admin') return <Navigate to="/admin/profile" replace />;
  if (role === 'Librarian') return <Navigate to="/librarian/profile" replace />;
  return <ProfilePage />;
}

function LibrarianBooksEntry() {
  const [searchParams] = useSearchParams();
  return searchParams.get('view') === 'copies'
    ? <Navigate to="/librarian/books/copies" replace />
    : <LibrarianCategoriesPage />;
}

function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const role = useAuthStore((s) => s.user?.role);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!accessToken) return;
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void useAuthStore.getState().getAccessToken().catch(() => {});
    };
    // Do not wait for an HTTP 401: pages also use plain fetch and may stay open for hours.
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [accessToken]);

  useEffect(() => {
    // A public enhancement should not delay the first screen users navigate to.
    const id = window.setTimeout(() => void import('./features/home/components/PinnedNewsPoster'), 1200);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
    <Suspense fallback={<PageLoading />}>
    <PinnedNewsPoster />
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/books" element={<HomeCatalogPage />} />
      <Route path="/books/:bookId" element={<BookDetailPage />} />
      <Route path="/services" element={<Navigate to="/books" replace />} />
      <Route path="/news" element={<HomeInfoPage section="news" />} />
      <Route path="/news/:articleId" element={<NewsArticleDetailPage />} />
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
      <Route path="/favorites" element={
        <RoleGuard allowedRoles={['Reader']}>
          <ReaderFavoritesPage />
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
        <Route path="books" element={<LibrarianBooksEntry />} />
        <Route path="books/copies" element={<LibrarianCopiesPage />} />
        <Route path="books/categories/new" element={<LibrarianCreateCategoryPage />} />
        <Route path="books/categories/:categoryId" element={<LibrarianCategoryBooksPage />} />
        <Route path="books/categories/:categoryId/add" element={<LibrarianCategoryBooksPage />} />
        <Route path="books/:bookId" element={<LibrarianBookDetailPage />} />
        <Route path="copies" element={<Navigate to="/librarian/books/copies" replace />} />
        <Route path="loans" element={<LibrarianModulePage />} />
        <Route path="fines" element={<LibrarianModulePage />} />
        <Route path="ai-settings" element={<LibrarianAiPage />} />
        <Route path="ai-recommendations" element={<Navigate to="/librarian/ai-settings" replace />} />
        <Route path="circulation" element={<Navigate to="/librarian/circulation/loans" replace />} />
        <Route path="circulation/direct-borrow" element={<DirectCheckoutPage />} />
        <Route path="circulation/incidents/:incidentId" element={<CirculationIncidentDetailPage />} />
        <Route path="circulation/:tab" element={<CirculationPage />} />
        <Route path="reports" element={<LibrarianReportsPage />} />
        <Route path="reports/new" element={<LibrarianReportsPage />} />
        <Route path="reports/:id" element={<LibrarianReportDetailPage />} />
        <Route path="news" element={<LibrarianNewsPage />} />
        <Route path="news/:articleId" element={<NewsArticleDetailPage librarianMode />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="support/requests" element={<LibrarianSupportPage view="requests" />} />
        <Route path="support/chat" element={<LibrarianSupportPage view="chat" />} />
        <Route path="support/replies" element={<LibrarianSupportPage view="chat" />} />
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
    {role === 'Reader' && <RagAskPanel />}
    </Suspense>
    </>
  );
}

export default App;
