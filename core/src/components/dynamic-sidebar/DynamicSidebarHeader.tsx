'use client';

import React from 'react';
import { useDynamicSidebar } from './DynamicSidebarContext';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

export function DynamicSidebarHeader() {
    const { header, isOpen, toggle } = useDynamicSidebar();

    if (!header && !isOpen) {
        return (
            <div className="flex items-center justify-center h-14 border-b border-border shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggle}
                    className="h-9 w-9"
                    title="Open sidebar"
                >
                    <PanelLeftOpen className="h-5 w-5" />
                </Button>
            </div>
        );
    }

    return (
        <div className={cn(
            "flex items-center justify-between w-full h-14 px-4 border-b border-border shrink-0 transition-all duration-300 overflow-hidden",
            !isOpen && "px-2 justify-center"
        )}>
            {isOpen && (
                <div className="flex-1 truncate mr-2">
                    {header?.type === 'text' ? (
                        <h1 className="text-lg font-semibold text-foreground truncate">{header.content}</h1>
                    ) : (
                        header?.content
                    )}
                </div>
            )}

            <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                className={cn("h-9 w-9 shrink-0", !isOpen && "mx-auto")}
                title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
                {isOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
            </Button>
        </div>
    );
}
