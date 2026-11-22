import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

interface ProtectedRouteProps {
  children: React.ReactElement;
  allowedRoles?: ('Reader' | 'Librarian' | 'Admin')[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }

  if (user.role === 'Reader' && user.status !== 'Active'
      && location.pathname !== '/profile' && location.pathname !== '/') {
    return <Navigate to="/profile" replace />;
  }

  if (user.role === 'Reader' && user.isVerified === false
      && (location.pathname === '/support' || location.pathname.startsWith('/history') || location.pathname.startsWith('/books/'))) {
    return <Navigate to={`/profile?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return children;
};
