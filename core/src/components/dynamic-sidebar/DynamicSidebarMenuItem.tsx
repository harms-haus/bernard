'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useDynamicSidebar } from './DynamicSidebarContext';

interface DynamicSidebarMenuItemProps {
    id: string;
    children: React.ReactNode;
    href?: string;
    onClick?: () => void;
    isActive?: boolean;
    isDisabled?: boolean;
    className?: string;
}

export function DynamicSidebarMenuItem({
    id,
    children,
    href,
    onClick,
    isActive: explicitIsActive,
    isDisabled,
    className
}: DynamicSidebarMenuItemProps) {
    const pathname = usePathname();
    const { isOpen } = useDynamicSidebar();

    const isActive = explicitIsActive !== undefined
        ? explicitIsActive
        : (href ? pathname === href : false);

    const baseClasses = cn(
        "flex items-center w-full rounded-md transition-all duration-200 text-sm font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isDisabled && "opacity-50 cursor-not-allowed pointer-events-none",
        isActive
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-accent/50 hover:text-accent-foreground",
        !isOpen ? "justify-center p-2" : "px-3 py-2",
        className
    );

    const content = (
        <div className={cn("flex items-center w-full", !isOpen && "justify-center")}>
            {children}
        </div>
    );

    if (href && !isDisabled) {
        return (
            <Link
                href={href}
                className={baseClasses}
                onClick={onClick}
                title={!isOpen ? (typeof children === 'string' ? children : id) : undefined}
            >
                {content}
            </Link>
        );
    }

    return (
        <div
            role="button"
            tabIndex={isDisabled ? -1 : 0}
            className={cn(baseClasses, "cursor-pointer")}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!isDisabled && onClick) onClick();
                }
            }}
            aria-disabled={isDisabled}
            title={!isOpen ? (typeof children === "string" ? children : id) : undefined}
        >
            {content}
        </div>
    );
}
