import { createContext, useContext, ReactNode, useCallback, useState } from 'react';
import type { ConversationListItem } from '../types/conversation';
import { apiClient } from '../services/api';

interface ThreadContextType {
  threads: ConversationListItem[];
  getThreads: () => Promise<ConversationListItem[]>;
  setThreads: (threads: ConversationListItem[]) => void;
  threadsLoading: boolean;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ConversationListItem[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const getThreads = useCallback(async (): Promise<ConversationListItem[]> => {
    setThreadsLoading(true);
    try {
      const response = await apiClient.listConversations({ limit: 50 });
      setThreads(response.conversations);
      return response.conversations;
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
