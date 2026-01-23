'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useDynamicHeader } from '../DynamicHeaderContext';
import { PenSquare, Ghost } from 'lucide-react';
import { useRouter } from '@/lib/router/compat';

export function useChatHeaderConfig() {
    const { setTitle, setSubtitle, setActions, reset } = useDynamicHeader();
    const router = useRouter();
    const [isGhostMode, setIsGhostMode] = useState(false);

    const handleNewChat = useCallback(() => {
        router.replace('/bernard/chat');
    }, [router]);

    const handleGhostModeToggle = useCallback(() => {
        setIsGhostMode(prev => !prev);
    }, []);

    const actions = useMemo(() => [
        {
            id: 'new-chat',
            label: 'New Chat',
            icon: <PenSquare className="mr-2 h-4 w-4" />,
            onClick: handleNewChat
        },
        {
            id: 'ghost-mode',
            label: isGhostMode ? 'Disable Ghost Mode' : 'Enable Ghost Mode',
            icon: <Ghost className="mr-2 h-4 w-4" />,
            onClick: handleGhostModeToggle
        }
    ], [isGhostMode, handleNewChat, handleGhostModeToggle]);

    useEffect(() => {
        // We don't necessarily set title/subtitle here as they are often dynamic based on the thread
        // But we CAN set the default actions for chat
        setActions(actions);

        // We don't reset on unmount here if we expect title/subtitle to persist or be managed elsewhere
        // Actually, usually we should reset to avoid leak
        return () => reset();
    }, [setActions, reset, actions]);

    return { isGhostMode };
}

export function ChatHeaderConfig({ children }: { children: React.ReactNode }) {
    useChatHeaderConfig();
    return <>{children}</>;
}
