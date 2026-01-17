'use client';

import { UserLayout } from '@/components/UserLayout';

export default function UserSectionLayout({ children }: { children: React.ReactNode }) {
    return <UserLayout>{children}</UserLayout>;
}
