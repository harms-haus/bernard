'use client';

import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import { DynamicSidebarContext } from './DynamicSidebarContext';
import {
    DynamicSidebarMenuItemConfig,
    DynamicSidebarHeaderConfig,
    DynamicSidebarContextValue
} from './types';

const SIDEBAR_STATE_KEY = 'bernard-sidebar-state';

export function DynamicSidebarProvider({ children }: { children: ReactNode }) {
    const [header, setHeader] = useState<DynamicSidebarHeaderConfig | null>(null);
    const [menuItems, setMenuItems] = useState<DynamicSidebarMenuItemConfig[]>([]);
    const [footerItems, setFooterItems] = useState<ReactNode[]>([]);
    const [isOpen, setIsOpen] = useState<boolean>(true);

    // Load state from localStorage on mount
    useEffect(() => {
        const savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
        if (savedState === 'true') {
            setIsOpen(true);
        } else if (savedState === 'false') {
            setIsOpen(false);
        }
        // Invalid values are ignored, keeping default isOpen = true
    }, []);

    // Save state to localStorage when it changes
    const setSidebarOpen = useCallback((open: boolean) => {
        setIsOpen(open);
        localStorage.setItem(SIDEBAR_STATE_KEY, String(open));
    }, []);

    const toggle = useCallback(() => {
        setSidebarOpen(!isOpen);
    }, [isOpen, setSidebarOpen]);

    const addMenuItem = useCallback((item: DynamicSidebarMenuItemConfig, index?: number) => {
        setMenuItems(prev => {
            const newItems = [...prev];
            if (index !== undefined) {
                newItems.splice(index, 0, item);
            } else {
                newItems.push(item);
            }
            return newItems;
        });
    }, []);

    const removeMenuItem = useCallback((id: string) => {
        setMenuItems(prev => prev.filter(item => item.id !== id));
    }, []);

    const updateMenuItem = useCallback((id: string, updates: Partial<DynamicSidebarMenuItemConfig>) => {
        setMenuItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    }, []);

    const addFooterItem = useCallback((item: ReactNode, index?: number) => {
        setFooterItems(prev => {
            const newItems = [...prev];
            if (index !== undefined) {
                newItems.splice(index, 0, item);
            } else {
                newItems.push(item);
            }
            return newItems;
        });
    }, []);

    const clearFooterItems = useCallback(() => {
        setFooterItems([]);
    }, []);

    const reset = useCallback(() => {
        setHeader(null);
        setMenuItems([]);
        setFooterItems([]);
        setSidebarOpen(true);
    }, [setSidebarOpen]);

    const value: DynamicSidebarContextValue = {
        header,
        setHeader,
        menuItems,
        setMenuItems,
        addMenuItem,
        removeMenuItem,
        updateMenuItem,
        footerItems,
        setFooterItems,
        addFooterItem,
        clearFooterItems,
        isOpen,
        setIsOpen: setSidebarOpen,
        toggle,
        reset
    };

    return (
        <DynamicSidebarContext.Provider value={value}>
            {children}
        </DynamicSidebarContext.Provider>
    );
}
