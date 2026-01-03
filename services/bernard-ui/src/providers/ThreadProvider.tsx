import { createContext, useContext, ReactNode, useCallback, useState } from 'react';

interface ThreadItem {
  id: string;
  name?: string;
  createdAt: string;
  lastTouchedAt: string;
}

interface ThreadContextType {
  threads: ThreadItem[];
  getThreads: () => Promise<ThreadItem[]>;
  setThreads: (threads: ThreadItem[]) => void;
  threadsLoading: boolean;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const getThreads = useCallback(async (): Promise<ThreadItem[]> => {
    setThreadsLoading(true);
    try {
      // Thread list is managed locally via URL params
      // This is a placeholder for potential future backend integration
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
