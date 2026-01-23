'use client';

import React, { useEffect } from 'react';
import { LayoutDashboard, Settings, Server, Users as UsersIcon, Home, Briefcase } from 'lucide-react';
import { useDynamicSidebar } from '../DynamicSidebarContext';
import { Button } from '../../ui/button';
import Link from 'next/link';

export function useAdminSidebarConfig() {
    const { setHeader, setMenuItems, setFooterItems, reset, isOpen } = useDynamicSidebar();

    useEffect(() => {
        setHeader({ type: 'text', content: 'Admin Panel' });

        setMenuItems([
            {
                id: 'status',
                href: '/bernard/admin',
                children: (
                    <>
                        <LayoutDashboard className={isOpen ? "mr-3 h-5 w-5" : "h-5 w-5"} />
                        {isOpen && <span>Status</span>}
                    </>
                )
            },
            {
                id: 'models',
                href: '/bernard/admin/models',
                children: (
                    <>
                        <Settings className={isOpen ? "mr-3 h-5 w-5" : "h-5 w-5"} />
                        {isOpen && <span>Models</span>}
                    </>
                )
            },
            {
                id: 'services',
                href: '/bernard/admin/services',
                children: (
                    <>
                        <Server className={isOpen ? "mr-3 h-5 w-5" : "h-5 w-5"} />
                        {isOpen && <span>Services</span>}
                    </>
                )
            },
            {
                id: 'jobs',
                href: '/bernard/admin/jobs',
                children: (
                    <>
                        <Briefcase className={isOpen ? "mr-3 h-5 w-5" : "h-5 w-5"} />
                        {isOpen && <span>Jobs</span>}
                    </>
                )
            },
            {
                id: 'users',
                href: '/bernard/admin/users',
                children: (
                    <>
                        <UsersIcon className={isOpen ? "mr-3 h-5 w-5" : "h-5 w-5"} />
                        {isOpen && <span>Users</span>}
                    </>
                )
            }
        ]);

        setFooterItems([
            <Button
                key="chat-link"
                variant="outline"
                className="w-full justify-start"
                asChild
            >
                <Link href="/bernard/chat">
                    <Home className={isOpen ? "mr-2 h-4 w-4" : "h-4 w-4"} />
                    {isOpen && "Chat"}
                </Link>
            </Button>
        ]);

        return () => reset();
    }, [setHeader, setMenuItems, setFooterItems, reset, isOpen]);
}

export function AdminSidebarConfig({ children }: { children: React.ReactNode }) {
    useAdminSidebarConfig();
    return <>{children}</>;
}
