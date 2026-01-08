'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ServiceStatus {
  id: string;
  name: string;
  port: number;
  status: 'running' | 'stopped' | 'starting' | 'failed';
  uptime?: number;
  health: 'healthy' | 'unhealthy' | 'unknown';
}

interface UseServiceStatusOptions {
  autoRefresh?: boolean;
  interval?: number;
}

export function useServiceStatus({ autoRefresh = true, interval = 3000 }: UseServiceStatusOptions = {}) {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/services');
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setServices(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    if (autoRefresh) {
      const intervalId = setInterval(fetchStatus, interval);
      return () => clearInterval(intervalId);
    }
  }, [fetchStatus, autoRefresh, interval]);

  const startService = useCallback(async (serviceId: string) => {
    const response = await fetch(`/api/services/${serviceId}/start`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to start service');
    await fetchStatus();
  }, [fetchStatus]);

  const stopService = useCallback(async (serviceId: string) => {
    const response = await fetch(`/api/services/${serviceId}/stop`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to stop service');
    await fetchStatus();
  }, [fetchStatus]);

  const restartService = useCallback(async (serviceId: string) => {
    const response = await fetch(`/api/services/${serviceId}/restart`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to restart service');
    await fetchStatus();
  }, [fetchStatus]);

  return {
    services,
    loading,
    error,
    refresh: fetchStatus,
    startService,
    stopService,
    restartService,
  };
}

export function useService(serviceId: string) {
  const result = useServiceStatus({ autoRefresh: true, interval: 3000 });
  const status = result.services.find(s => s.id === serviceId) || null;
  return { status, ...result };
}
