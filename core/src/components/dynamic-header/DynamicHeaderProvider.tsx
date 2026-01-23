'use client';

import React, { useState, useCallback, useMemo, ReactNode } from 'react';
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
        setActionsState(prev => {
            // Shallow comparison to prevent unnecessary updates
            if (prev.length !== newActions.length) {
                return newActions;
            }
            for (let i = 0; i < prev.length; i++) {
                if (prev[i].id !== newActions[i].id || 
                    prev[i].label !== newActions[i].label ||
                    prev[i].onClick !== newActions[i].onClick) {
                    return newActions;
                }
            }
            return prev; // No changes, return previous reference
        });
    }, []);

    const reset = useCallback(() => {
        setTitleState(defaultTitle);
        setSubtitleState(null);
        setActionsState([]);
    }, [defaultTitle]);

    const value = useMemo(() => ({
        title,
        subtitle,
        actions,
        setTitle,
        setSubtitle,
        setActions,
        reset,
    }), [title, subtitle, actions, setTitle, setSubtitle, setActions, reset]);

    return (
        <DynamicHeaderContext.Provider value={value}>
            {children}
        </DynamicHeaderContext.Provider>
    );
}
