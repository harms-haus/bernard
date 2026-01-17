'use client';

import React from 'react';
import { useDynamicSidebar } from './DynamicSidebarContext';
import { UserBadge } from '../UserBadge';
import { cn } from '@/lib/utils';

export function DynamicSidebarFooter() {
    const { footerItems, isOpen } = useDynamicSidebar();

    return (
        <div className={cn(
            "p-4 border-t border-border space-y-3 shrink-0 bg-background/50 backdrop-blur-sm",
            !isOpen && "p-2 items-center"
        )}>
            {footerItems.length > 0 && isOpen && (
                <div className="space-y-3 mb-3">
                    {footerItems.map((item, index) => (
                        <React.Fragment key={index}>
                            {item}
                        </React.Fragment>
                    ))}
                </div>
            )}
            <UserBadge />
        </div>
    );
}
