'use client';

import React, { useEffect, useState } from 'react';
import { useDynamicHeader } from '../DynamicHeaderContext';
import { PenSquare, Ghost } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function useChatHeaderConfig() {
    const { setTitle, setSubtitle, setActions, reset } = useDynamicHeader();
    const router = useRouter();
    const [isGhostMode, setIsGhostMode] = useState(false);

    useEffect(() => {
        // We don't necessarily set title/subtitle here as they are often dynamic based on the thread
        // But we CAN set the default actions for chat

        setActions([
            {
                id: 'new-chat',
                label: 'New Chat',
                icon: <PenSquare className="mr-2 h-4 w-4" />,
                onClick: () => router.replace('/bernard/chat')
            },
            {
                id: 'ghost-mode',
                label: isGhostMode ? 'Disable Ghost Mode' : 'Enable Ghost Mode',
                icon: <Ghost className="mr-2 h-4 w-4" />,
                onClick: () => setIsGhostMode(prev => !prev)
            }
        ]);

        // We don't reset on unmount here if we expect title/subtitle to persist or be managed elsewhere
        // Actually, usually we should reset to avoid leak
        return () => reset();
    }, [setActions, reset, router, isGhostMode]);

    return { isGhostMode };
}

export function ChatHeaderConfig({ children }: { children: React.ReactNode }) {
    useChatHeaderConfig();
    return <>{children}</>;
}
