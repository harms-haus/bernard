import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { ThreadListItem } from '@/services/api';
import { useThreads } from '@/providers/ThreadProvider';
import { useAuth } from '@/hooks/useAuth';
import { useSidebarState } from '@/components/chat/ConversationHistory';

export interface ConversationHistoryData {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  threadId: string | null;
  threads: ThreadListItem[];
  threadsLoading: boolean;
  isCreating: boolean;
  isMobileOpen: boolean;
  setIsMobileOpen: (value: boolean) => void;
  isAdmin: boolean;
  handleThreadClick: (id: string) => void;
  handleNewChat: () => Promise<void>;
  toggleSidebar: () => void;
}

export function useConversationHistoryData(): ConversationHistoryData {
  const [isOpen, setIsOpen] = useSidebarState();
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = searchParams.get('threadId');
  const { threads, threadsLoading, getThreads, createNewThread } = useThreads();
  const { state } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (threads.length === 0) {
      getThreads().catch((error: Error) => {
        console.error('Failed to fetch threads:', error);
      });
    }
  }, [getThreads, threads.length]);

  const handleThreadClick = useCallback((id: string) => {
    router.replace(`/bernard/chat?threadId=${id}`);
  }, [router]);

  const handleNewChat = useCallback(async () => {
    setIsCreating(true);
    try {
      const newId = await createNewThread();
      handleThreadClick(newId);
    } catch (error) {
      console.error('Failed to create new thread:', error);
    } finally {
      setIsCreating(false);
    }
  }, [createNewThread, handleThreadClick]);

  const toggleSidebar = useCallback(() => {
    setIsOpen((prev: boolean) => !prev);
  }, [setIsOpen]);

  return {
    isOpen,
    setIsOpen,
    threadId,
    threads,
    threadsLoading,
    isCreating,
    isMobileOpen,
    setIsMobileOpen,
    isAdmin: state.user?.isAdmin ?? false,
    handleThreadClick,
    handleNewChat,
    toggleSidebar,
  };
}
