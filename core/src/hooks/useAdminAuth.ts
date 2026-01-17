import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';

export function useAdminAuth() {
  const { state } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isAdminLoading, setIsAdminLoading] = useState<boolean>(true);

  useEffect(() => {
    // The useAuth hook already calls getCurrentUser() on mount,
    // so we can derive admin status from the existing user state
    const isLoading = state.loading;
    const hasUser = !!state.user;
    const userIsAdmin = state.user?.role === 'admin';

    setIsAdminLoading(isLoading || (!hasUser && !state.error));
    setIsAdmin(userIsAdmin);
  }, [state.loading, state.user, state.error]);

  return {
    isAdmin,
    isAdminLoading,
    user: state.user,
    error: state.error,
    loading: state.loading
  };
}