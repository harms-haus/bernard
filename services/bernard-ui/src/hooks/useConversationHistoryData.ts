import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ThreadListItem } from '@/services/api';

export interface UseConversationHistoryDataDependencies {
  useSearchParams: () => [URLSearchParams, (params: URLSearchParams) => void];
  useThreads: () => ThreadContextType;
  useAuth: () => AuthContextType;
  useSidebarState: () => readonly [boolean, (value: boolean) => void];
}

export interface ThreadContextType {
  threads: ThreadListItem[];
  threadsLoading: boolean;
  getThreads: () => Promise<void>;
  createNewThread: () => Promise<string>;
}

export interface AuthContextType {
  state: {
    user: { isAdmin?: boolean } | null;
  };
}

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

export function useConversationHistoryData(
  deps: Partial<UseConversationHistoryDataDependencies> = {}
): ConversationHistoryData {
  const {
    useSearchParams: useSearchParamsImpl = () => useSearchParams(),
    useThreads: useThreadsImpl = () => {
      const mod = require('@/providers/ThreadProvider');
      return mod.useThreads();
    },
    useAuth: useAuthImpl = () => {
      const mod = require('@/hooks/useAuth');
      return mod.useAuth();
    },
    useSidebarState: useSidebarStateImpl = () => {
      const mod = require('@/components/chat/ConversationHistory');
      return mod.useSidebarState();
    },
  } = deps;

  const [isOpen, setIsOpen] = useSidebarStateImpl();
  const [searchParams, setSearchParams] = useSearchParamsImpl();
  const threadId = searchParams.get('threadId');
  const { threads, threadsLoading, getThreads, createNewThread } = useThreadsImpl();
  const { state } = useAuthImpl();
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
    const newParams = new URLSearchParams(searchParams);
    newParams.set('threadId', id);
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  const handleNewChat = useCallback(async () => {
    setIsCreating(true);
    try {
      const newId = await createNewThread();
      handleThreadClick(newId);
    } catch (error) {
      console.error('Failed to create new thread:', error);
      // Consider exposing an error state or using a toast notification
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
