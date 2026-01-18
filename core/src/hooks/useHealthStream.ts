'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext, ReactNode } from 'react';

export type HealthStreamStatus = 'up' | 'down' | 'starting' | 'degraded';

export interface HealthStreamUpdate {
  service: string;
  name: string;
  status: HealthStreamStatus;
  timestamp: string;
  isChange: boolean;
  previousStatus?: HealthStreamStatus;
  responseTime?: number;
  error?: string;
}

interface UseHealthStreamOptions {
  enabled?: boolean;
}

// ============================================================================
// Test Health Stream Context (for testing only)
// ============================================================================

export type TestHealthStreamContextType = {
  services: Record<string, HealthStreamUpdate>;
  serviceList: HealthStreamUpdate[];
  getService: (serviceId: string) => HealthStreamUpdate | null;
  isConnected: boolean;
  error: string | null;
  refresh: () => void;
};

const TestHealthStreamContext = createContext<TestHealthStreamContextType | undefined>(undefined);

// Export TestHealthStreamContext for test providers
export { TestHealthStreamContext };

interface HealthStreamTestProviderProps {
  children: ReactNode;
  isConnected?: boolean;
  error?: string | null;
  value?: Partial<TestHealthStreamContextType>;
}

export function HealthStreamTestProvider({
  children,
  isConnected = true,
  error = null,
  value,
}: HealthStreamTestProviderProps) {
  const contextValue: TestHealthStreamContextType = {
    services: {},
    serviceList: [],
    getService: () => null,
    isConnected,
    error,
    refresh: () => { },
    ...value,
  };

  return (
    TestHealthStreamContext.Provider({ value: contextValue, children })
  );
}

export function useTestHealthStream() {
  const context = useContext(TestHealthStreamContext);
  if (context === undefined) {
    throw new Error('useTestHealthStream must be used within a HealthStreamTestProvider');
  }
  return context;
}

export function useHealthStream({ enabled = true }: UseHealthStreamOptions = {}) {
  const testContext = useContext(TestHealthStreamContext);

  const [services, setServices] = useState<Record<string, HealthStreamUpdate>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!enabled || eventSourceRef.current) return;

    const eventSource = new EventSource('/api/health/stream');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const update: HealthStreamUpdate = JSON.parse(event.data);
        setServices((prev) => ({
          ...prev,
          [update.service]: update,
        }));
      } catch {
        // Skip invalid JSON
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError('Connection lost. Reconnecting...');
      eventSource.close();
      eventSourceRef.current = null;

      setTimeout(() => {
        if (!eventSourceRef.current) {
          connect();
        }
      }, 3000);
    };
  }, [enabled]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const getStatusList = useCallback(() => {
    return Object.values(services).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [services]);

  const getService = useCallback((serviceId: string) => {
    return services[serviceId] || null;
  }, [services]);

  const realContext = {
    services,
    serviceList: getStatusList(),
    getService,
    isConnected,
    error,
    refresh: connect,
  };

  return testContext ?? realContext;
}
