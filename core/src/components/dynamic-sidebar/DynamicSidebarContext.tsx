'use client';

import { createContext, useContext } from 'react';
import { DynamicSidebarContextValue } from './types';

export const DynamicSidebarContext = createContext<DynamicSidebarContextValue | undefined>(undefined);

export function useDynamicSidebar() {
    const context = useContext(DynamicSidebarContext);
    if (context === undefined) {
        throw new Error('useDynamicSidebar must be used within a DynamicSidebarProvider');
    }
    return context;
}
