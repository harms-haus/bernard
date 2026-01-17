'use client';

import React, { useEffect } from 'react';
import { useDynamicHeader } from '../DynamicHeaderContext';
import { DynamicHeaderAction } from '../types';

interface PageHeaderConfigProps {
    title?: string;
    subtitle?: string | null;
    actions?: DynamicHeaderAction[];
    children?: React.ReactNode;
}

export function usePageHeaderConfig({ title, subtitle, actions }: PageHeaderConfigProps) {
    const { setTitle, setSubtitle, setActions, reset } = useDynamicHeader();

    useEffect(() => {
        if (title !== undefined) setTitle(title);
        if (subtitle !== undefined) setSubtitle(subtitle);
        if (actions !== undefined) setActions(actions);

        return () => reset();
    }, [title, subtitle, actions, setTitle, setSubtitle, setActions, reset]);
}

export function PageHeaderConfig({ title, subtitle, actions, children }: PageHeaderConfigProps) {
    usePageHeaderConfig({ title, subtitle, actions });
    return <>{children}</>;
}
