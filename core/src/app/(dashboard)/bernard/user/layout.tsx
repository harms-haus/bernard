'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLayout } from '@/components/UserLayout';
import { useAuth } from '@/hooks/useAuth';

export default function UserSectionLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { state: authState } = useAuth();

    useEffect(() => {
        // Redirect to login when user is not authenticated (null) and not loading
        if (!authState.loading && !authState.user) {
            router.replace('/auth/login');
        }
        // Redirect to chat when user is a guest
        if (!authState.loading && authState.user?.role === 'guest') {
            router.replace('/bernard/chat');
        }
    }, [authState, router]);

    // Don't render anything while checking auth, if unauthenticated, or if guest
    if (authState.loading || !authState.user || authState.user?.role === 'guest') {
        return null;
    }

    return <UserLayout>{children}</UserLayout>;
}
