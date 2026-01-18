'use client';

import { createContext, useContext, ReactNode, useCallback, useState } from 'react';
import { getAPIClient } from '@/lib/api/client';
import type { ThreadListItem } from '@/services/api';
import type { IAPIClient } from '@/lib/api/types';
import { toast } from 'sonner';

interface ThreadContextType {
  threads: ThreadListItem[];
  getThreads: () => Promise<ThreadListItem[]>;
  setThreads: (threads: ThreadListItem[]) => void;
  createThread: (id: string) => void;
  createNewThread: () => Promise<string>;
  updateThread: (threadId: string, name: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  threadsLoading: boolean;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

interface ThreadProviderProps {
  children: ReactNode;
  apiClient?: IAPIClient;
}

export function ThreadProvider({ children, apiClient = getAPIClient() }: ThreadProviderProps) {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const getThreads = useCallback(async (): Promise<ThreadListItem[]> => {
    setThreadsLoading(true);
    try {
      const response = await apiClient.listThreads(50);
      setThreads(response.threads);
      return response.threads;
    } catch (error) {
      const err = error as Error & { status?: number };
      if (err.status !== 404) {
        console.error('Failed to fetch threads:', error);
        toast.error('Failed to load threads');
      }
      return [];
    } finally {
      setThreadsLoading(false);
    }
  }, [apiClient]);


  const createThread = useCallback((id: string) => {
    setThreads((prev) => {
      if (prev.some((t) => t.id === id)) return prev;
      const newThread: ThreadListItem = {
        id,
        name: 'New Chat',
        createdAt: new Date().toISOString(),
        lastTouchedAt: new Date().toISOString(),
        messageCount: 0,
      };
      return [newThread, ...prev];
    });
  }, []);

  const createNewThread = useCallback(async () => {
    try {
      const response = await apiClient.createThread();
      const id = response.thread_id;
      createThread(id);
      return id;
    } catch (error) {
      console.error('Failed to create new thread:', error);
      throw error;
    }
  }, [apiClient, createThread]);

  const updateThread = useCallback(async (threadId: string, name: string) => {
    try {
      await apiClient.updateThread(threadId, name);
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, name } : t))
      );
    } catch (error) {
      console.error('Failed to update thread:', error);
      throw error;
    }
  }, [apiClient]);

  const deleteThread = useCallback(async (threadId: string) => {
    try {
      await apiClient.deleteThread(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    } catch (error) {
      console.error('Failed to delete thread:', error);
      throw error;
    }
  }, [apiClient]);

  const value = {
    threads,
    getThreads,
    setThreads,
    createThread,
    createNewThread,
    updateThread,
    deleteThread,
    threadsLoading,
  };

  return (
    <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error('useThreads must be used within a ThreadProvider');
  }
  return context;
}
