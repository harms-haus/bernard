'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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

export function useHealthStream({ enabled = true }: UseHealthStreamOptions = {}) {
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

  return {
    services,
    serviceList: getStatusList(),
    getService,
    isConnected,
    error,
    refresh: connect,
  };
}
