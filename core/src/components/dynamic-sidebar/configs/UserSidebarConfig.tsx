'use client';

import React, { useEffect } from 'react';
import {
    MessagesSquare,
    Key,
    Info,
    ListTodo,
    User as UserIcon,
    Shield
} from 'lucide-react';
import { useDynamicSidebar } from '../DynamicSidebarContext';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

export function useUserSidebarConfig() {
    const { setHeader, setMenuItems, setFooterItems, reset, isOpen } = useDynamicSidebar();
    const { state } = useAuth();

    useEffect(() => {
        setHeader({ type: 'text', content: 'Bernard UI' });

        setMenuItems([
            {
                id: 'profile',
                href: '/bernard/user/profile',
                children: (
                    <>
                        <UserIcon className={isOpen ? "mr-3 h-5 w-5" : "h-5 w-5"} />
                        {isOpen && <span>Profile</span>}
                    </>
                )
            },
            {
                id: 'keys',
                href: '/bernard/user/tokens',
                children: (
                    <>
                        <Key className={isOpen ? "mr-3 h-5 w-5" : "h-5 w-5"} />
                        {isOpen && <span>Keys</span>}
                    </>
                )
            }
        ]);

        const footerItems: React.ReactNode[] = [];

        if (state.user?.role === 'admin') {
            footerItems.push(
                <Link
                    key="admin-link"
                    href="/bernard/admin"
                    className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
                >
                    <Shield className={isOpen ? "mr-3 h-5 w-5" : "h-5 w-5"} />
                    {isOpen && "Admin"}
                </Link>
            );
        }

        setFooterItems(footerItems);

        return () => reset();
    }, [setHeader, setMenuItems, setFooterItems, reset, isOpen, state.user?.role]);
}

export function UserSidebarConfig({ children }: { children: React.ReactNode }) {
    useUserSidebarConfig();
    return <>{children}</>;
}
