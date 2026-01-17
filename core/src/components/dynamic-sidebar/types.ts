import { ReactNode } from 'react';

export interface DynamicSidebarMenuItemConfig {
    id: string;
    children: ReactNode;
    href?: string;
    onClick?: () => void;
    isActive?: boolean;
    isDisabled?: boolean;
    className?: string;
}

export type DynamicSidebarHeaderConfig =
    | { type: 'text'; content: string }
    | { type: 'component'; content: ReactNode };

export interface DynamicSidebarContextValue {
    // Header
    header: DynamicSidebarHeaderConfig | null;
    setHeader: (header: DynamicSidebarHeaderConfig | null) => void;

    // Menu Items
    menuItems: DynamicSidebarMenuItemConfig[];
    setMenuItems: (items: DynamicSidebarMenuItemConfig[]) => void;
    addMenuItem: (item: DynamicSidebarMenuItemConfig, index?: number) => void;
    removeMenuItem: (id: string) => void;
    updateMenuItem: (id: string, updates: Partial<DynamicSidebarMenuItemConfig>) => void;

    // Footer Items
    footerItems: ReactNode[];
    setFooterItems: (items: ReactNode[]) => void;
    addFooterItem: (item: ReactNode, index?: number) => void;
    clearFooterItems: () => void;

    // Sidebar State
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    toggle: () => void;

    // Reset
    reset: () => void;
}
