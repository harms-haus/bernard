import { ReactNode } from 'react';

export interface DynamicHeaderAction {
    id: string;
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    variant?: 'default' | 'destructive';
}

export interface DynamicHeaderContextValue {
    title: string;
    subtitle: string | null;
    actions: DynamicHeaderAction[];
    setTitle: (title: string) => void;
    setSubtitle: (subtitle: string | null) => void;
    setActions: (actions: DynamicHeaderAction[]) => void;
    reset: () => void;
}
