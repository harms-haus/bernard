'use client';

import React from 'react';
import { useDynamicSidebar } from './DynamicSidebarContext';
import { DynamicSidebarMenuItem } from './DynamicSidebarMenuItem';
import { cn } from '@/lib/utils';

export function DynamicSidebarContent() {
    const { menuItems, isOpen } = useDynamicSidebar();

    return (
        <nav className={cn(
            "flex-1 overflow-y-auto py-4 scrollbar-thin scrollbar-thumb-accent scrollbar-track-transparent",
            isOpen ? "px-3" : "px-2"
        )}>
            <div className="space-y-1">
                {menuItems.map((item) => (
                    <DynamicSidebarMenuItem
                        key={item.id}
                        id={item.id}
                        href={item.href}
                        onClick={item.onClick}
                        isActive={item.isActive}
                        isDisabled={item.isDisabled}
                        className={item.className}
                    >
                        {item.children}
                    </DynamicSidebarMenuItem>
                ))}
            </div>
        </nav>
    );
}
