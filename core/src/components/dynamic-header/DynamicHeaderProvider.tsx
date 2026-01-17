'use client';

import React, { useState, useCallback, ReactNode } from 'react';
import { DynamicHeaderContext } from './DynamicHeaderContext';
import { DynamicHeaderAction } from './types';

interface DynamicHeaderProviderProps {
    children: ReactNode;
    defaultTitle?: string;
}

export function DynamicHeaderProvider({ children, defaultTitle = 'Bernard' }: DynamicHeaderProviderProps) {
    const [title, setTitleState] = useState(defaultTitle);
    const [subtitle, setSubtitleState] = useState<string | null>(null);
    const [actions, setActionsState] = useState<DynamicHeaderAction[]>([]);

    const setTitle = useCallback((newTitle: string) => {
        setTitleState(newTitle);
    }, []);

    const setSubtitle = useCallback((newSubtitle: string | null) => {
        setSubtitleState(newSubtitle);
    }, []);

    const setActions = useCallback((newActions: DynamicHeaderAction[]) => {
        setActionsState(newActions);
    }, []);

    const reset = useCallback(() => {
        setTitleState(defaultTitle);
        setSubtitleState(null);
        setActionsState([]);
    }, [defaultTitle]);

    const value = {
        title,
        subtitle,
        actions,
        setTitle,
        setSubtitle,
        setActions,
        reset,
    };

    return (
        <DynamicHeaderContext.Provider value={value}>
            {children}
        </DynamicHeaderContext.Provider>
    );
}
