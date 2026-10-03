import React from 'react';
import { useAuthStore } from '../store/useAuthStore';

interface CanProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const Can: React.FC<CanProps> = ({ permission, children, fallback = null }) => {
  const permissions = useAuthStore((state) => state.permissions);
  const userRole = useAuthStore((state) => state.user?.role);

  // Admin always has full permissions
  if (userRole === 'Admin' || permissions.includes(permission)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};
