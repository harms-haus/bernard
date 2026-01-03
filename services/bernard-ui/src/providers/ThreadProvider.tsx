import { createContext, useContext, ReactNode, useCallback, useState } from 'react';
import { apiClient, type ThreadListItem } from '../services/api';

interface ThreadContextType {
  threads: ThreadListItem[];
  getThreads: () => Promise<ThreadListItem[]>;
  setThreads: (threads: ThreadListItem[]) => void;
  threadsLoading: boolean;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const getThreads = useCallback(async (): Promise<ThreadListItem[]> => {
    setThreadsLoading(true);
    try {
      const response = await apiClient.listThreads(50);
      const threadList = response.threads;
      setThreads(threadList);
      return threadList;
    } catch (error) {
      console.error('Failed to fetch threads:', error);
      setThreads([]);
      return [];
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  return (
    <ThreadContext.Provider value={{ threads, getThreads, setThreads, threadsLoading }}>
      {children}
    </ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error('useThreads must be used within a ThreadProvider');
  }
  return context;
}
