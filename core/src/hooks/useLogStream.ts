'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  raw: string;
  [key: string]: unknown;
}

interface UseLogStreamOptions {
  service: string;
  enabled?: boolean;
  maxEntries?: number;
  autoScroll?: boolean;
}

export function useLogStream({
  service,
  enabled = true,
  maxEntries = 1000,
  autoScroll = true,
}: UseLogStreamOptions) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const connect = useCallback(() => {
    if (!enabled || eventSourceRef.current) return;

    const url = `/api/logs/stream?service=${encodeURIComponent(service)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const entry: LogEntry = JSON.parse(event.data);
        setLogs((prev) => {
          const newLogs = [...prev, entry];
          if (newLogs.length > maxEntries) {
            return newLogs.slice(-maxEntries);
          }
          return newLogs;
        });
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
  }, [service, enabled, maxEntries]);

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

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    isConnected,
    error,
    clearLogs,
    containerRef,
  };
}
