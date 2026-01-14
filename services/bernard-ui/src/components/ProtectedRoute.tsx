import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { state } = useAuth();
  const location = useLocation();

  // If user is loading, show a loading state
  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is not logged in, redirect to core auth login with the current location
  if (!state.user) {
    const redirectTo = encodeURIComponent(location.pathname);
    window.location.href = `/auth/login?redirect=${redirectTo}`;
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // If admin access is required but user is not admin, redirect to home
  if (requireAdmin && !state.user.isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}