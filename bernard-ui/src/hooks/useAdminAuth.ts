import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';

export function useAdminAuth() {
  const { state, getCurrentUser } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isAdminLoading, setIsAdminLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAdmin = async () => {
      setIsAdminLoading(true);
      try {
        await getCurrentUser();
      } finally {
        setIsAdminLoading(false);
      }
    };

    checkAdmin();
  }, []);

  useEffect(() => {
    setIsAdmin(!!state.user?.isAdmin);
  }, [state.user]);

  return {
    isAdmin,
    isAdminLoading,
    user: state.user,
    error: state.error,
    loading: state.loading
  };
}