'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { JobTable } from '@/components/jobs/JobTable';
import { QueueStatsCard } from '@/components/jobs/QueueStatsCard';
import type { JobHistory, QueueStats, ListJobsOptions } from '@/lib/infra/worker-queue/types';
import { AdminLayout } from '@/components/AdminLayout';

function JobsAdminContent() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobHistory[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListJobsOptions>({
    limit: 50,
    offset: 0,
  });

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status.join(','));
      if (filters.type) params.set('type', filters.type.join(','));
      if (filters.limit) params.set('limit', filters.limit.toString());
      if (filters.offset) params.set('offset', filters.offset.toString());

      const res = await fetch(`/api/admin/jobs?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load jobs: ${res.statusText}`);
      }
      const data = await res.json();
      setJobs(data.jobs || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error('Failed to load jobs:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleRerun = async (jobId: string) => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/rerun`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Failed to rerun job: ${res.statusText}`);
      }
      await loadJobs();
    } catch (err) {
      console.error('Failed to rerun job:', err);
      alert(err instanceof Error ? err.message : 'Failed to rerun job');
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Failed to cancel job: ${res.statusText}`);
      }
      await loadJobs();
    } catch (err) {
      console.error('Failed to cancel job:', err);
      alert(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/delete`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`Failed to delete job: ${res.statusText}`);
      }
      await loadJobs();
    } catch (err) {
      console.error('Failed to delete job:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  // Set up SSE for real-time updates with stable refs and reconnection
  const loadJobsRef = useRef(loadJobs);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // 1 second

  // Keep ref updated with latest loadJobs
  useEffect(() => {
    loadJobsRef.current = loadJobs;
  }, [loadJobs]);

  useEffect(() => {
    const connect = () => {
      // Close existing connection if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource('/api/admin/jobs/stream');
      eventSourceRef.current = eventSource;

      const handleUpdate = () => {
        loadJobsRef.current();
      };

      eventSource.addEventListener('job:queued', handleUpdate);
      eventSource.addEventListener('job:started', handleUpdate);
      eventSource.addEventListener('job:finished', handleUpdate);
      eventSource.addEventListener('job:errored', handleUpdate);
      eventSource.addEventListener('job:cancelled', handleUpdate);

      eventSource.onerror = (err) => {
        console.error('SSE error:', err);
        eventSource.close();
        eventSourceRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.error('SSE: Max reconnection attempts reached');
        }
      };

      // Reset reconnect attempts on successful connection
      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
    };
  }, []); // Empty dependency array - effect runs once on mount

  // Initial load
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  return (
    <div className="space-y-6">
      {stats && <QueueStatsCard stats={stats} />}

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium">Status:</label>
          <select
            id="status-filter"
            value={filters.status?.join(',') || ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value ? e.target.value.split(',') as any : undefined, offset: 0 })}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="queued,starting,running">Active</option>
            <option value="finished">Completed</option>
            <option value="errored">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="type-filter" className="text-sm font-medium">Type:</label>
          <select
            id="type-filter"
            value={filters.type?.join(',') || ''}
            onChange={(e) => setFilters({ ...filters, type: e.target.value ? e.target.value.split(',') as any : undefined, offset: 0 })}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="thread-naming">Thread Naming</option>
            <option value="service:start,service:stop,service:restart,service:check">Service Actions</option>
          </select>
        </div>

        <button
          onClick={() => setFilters({ limit: 50, offset: 0 })}
          className="text-sm text-blue-500 hover:underline"
        >
          Clear Filters
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-500 p-4 rounded">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No jobs found
        </div>
      ) : (
        <JobTable
          jobs={jobs}
          onViewDetails={(jobId) => router.push(`/bernard/admin/jobs/${jobId}`)}
          onRerun={handleRerun}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

export default function JobsAdminPage() {
  return (
    <AdminLayout>
      <JobsAdminContent />
    </AdminLayout>
  );
}
