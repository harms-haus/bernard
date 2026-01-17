'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLayout } from '@/components/UserLayout';
import { useAuth } from '@/hooks/useAuth';

export default function UserSectionLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { state: authState } = useAuth();

    useEffect(() => {
        if (!authState.loading && authState.user?.role === 'guest') {
            router.replace('/bernard/chat');
        }
    }, [authState, router]);

    // Don't render anything while checking auth or if guest
    if (authState.loading || authState.user?.role === 'guest') {
        return null;
    }

    return <UserLayout>{children}</UserLayout>;
}
