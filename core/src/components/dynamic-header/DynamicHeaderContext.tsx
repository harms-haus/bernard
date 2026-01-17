'use client';

import { createContext, useContext } from 'react';
import { DynamicHeaderContextValue } from './types';

export const DynamicHeaderContext = createContext<DynamicHeaderContextValue | null>(null);

export function useDynamicHeader() {
    const context = useContext(DynamicHeaderContext);
    if (!context) {
        throw new Error('useDynamicHeader must be used within a DynamicHeaderProvider');
    }
    return context;
}
