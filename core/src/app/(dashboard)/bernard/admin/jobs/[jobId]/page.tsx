'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { JobHistory } from '@/lib/infra/worker-queue/types';
import { AdminLayout } from '@/components/AdminLayout';

function JobDetailsContent({
  jobId,
}: {
  jobId: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Job not found');
        }
        throw new Error(`Failed to load job: ${res.statusText}`);
      }
      const data = await res.json();
      setJob(data);
    } catch (err) {
      console.error('Failed to load job:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const handleRerun = async () => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/rerun`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Failed to rerun job: ${res.statusText}`);
      }
      router.push('/bernard/admin/jobs');
    } catch (err) {
      console.error('Failed to rerun job:', err);
      alert(err instanceof Error ? err.message : 'Failed to rerun job');
    }
  };

  const handleCancel = async () => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Failed to cancel job: ${res.statusText}`);
      }
      await loadJob();
    } catch (err) {
      console.error('Failed to cancel job:', err);
      alert(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) return;

    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/delete`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`Failed to delete job: ${res.statusText}`);
      }
      router.push('/bernard/admin/jobs');
    } catch (err) {
      console.error('Failed to delete job:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  // Set up SSE for real-time updates
  useEffect(() => {
    const eventSource = new EventSource('/api/admin/jobs/stream');

    const handleUpdate = () => {
      loadJob();
    };

    eventSource.addEventListener('job:queued', handleUpdate);
    eventSource.addEventListener('job:started', handleUpdate);
    eventSource.addEventListener('job:finished', handleUpdate);
    eventSource.addEventListener('job:errored', handleUpdate);
    eventSource.addEventListener('job:cancelled', handleUpdate);
    eventSource.addEventListener('job:progress', handleUpdate);

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [loadJob]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Jobs
        </Button>
        <div className="bg-red-500/10 text-red-500 p-4 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Jobs
        </Button>
        <div className="text-center py-8">Job not found</div>
      </div>
    );
  }

  const statusConfig: Record<string, { color: string; label: string }> = {
    queued: { color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', label: 'Queued' },
    starting: { color: 'bg-blue-500/20 text-blue-500 border-blue-500/30', label: 'Starting' },
    running: { color: 'bg-blue-500/20 text-blue-500 border-blue-500/30', label: 'Running' },
    'cleaning-up': { color: 'bg-purple-500/20 text-purple-500 border-purple-500/30', label: 'Cleaning Up' },
    finished: { color: 'bg-green-500/20 text-green-500 border-green-500/30', label: 'Finished' },
    errored: { color: 'bg-red-500/20 text-red-500 border-red-500/30', label: 'Errored' },
    cancelled: { color: 'bg-gray-500/20 text-gray-500 border-gray-500/30', label: 'Cancelled' },
    delayed: { color: 'bg-orange-500/20 text-orange-500 border-orange-500/30', label: 'Delayed' },
  };

  const config = statusConfig[job.status] || { color: 'bg-gray-500/20 text-gray-500', label: job.status };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getJobTypeLabel = (type: string) => {
    if (type.startsWith('service:')) {
      return type.replace('service:', '').toUpperCase();
    }
    return type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Jobs
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Job Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Job ID</label>
              <div className="font-mono text-sm">{job.jobId}</div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Type</label>
              <Badge variant="outline">{getJobTypeLabel(job.type)}</Badge>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Status</label>
              <div>
                <Badge className={config.color}>{config.label}</Badge>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Attempts</label>
              <Badge variant="secondary">{job.attempts}</Badge>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Queued At</label>
              <div className="text-sm">{new Date(job.queuedAt).toLocaleString()}</div>
            </div>
            {job.startedAt && (
              <div>
                <label className="text-sm text-muted-foreground">Started At</label>
                <div className="text-sm">{new Date(job.startedAt).toLocaleString()}</div>
              </div>
            )}
            {job.completedAt && (
              <div>
                <label className="text-sm text-muted-foreground">Completed At</label>
                <div className="text-sm">{new Date(job.completedAt).toLocaleString()}</div>
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Wait Time</label>
              <div className="text-sm">{formatDuration(job.waitTimeMs)}</div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Run Time</label>
              <div className="text-sm">{formatDuration(job.runTimeMs)}</div>
            </div>
            {job.durationMs && (
              <div>
                <label className="text-sm text-muted-foreground">Total Duration</label>
                <div className="text-sm">{formatDuration(job.durationMs)}</div>
              </div>
            )}
          </div>
          {job.rerunOf && (
            <Alert className="mt-4">
              <AlertDescription>
                This is a rerun of job <span className="font-mono">{job.rerunOf}</span>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {job.error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-destructive/10 p-4 rounded text-destructive overflow-x-auto text-sm">
              {job.error}
            </pre>
          </CardContent>
        </Card>
      )}

      {job.data != null && (
        <Card>
          <CardHeader>
            <CardTitle>Job Data</CardTitle>
            <CardDescription>
              Input data for the job. May contain PII.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <AlertDescription>
                This data may contain personally identifiable information. View responsibly.
              </AlertDescription>
            </Alert>
            <pre className="bg-muted p-4 rounded overflow-x-auto text-sm">
              {JSON.stringify(job.data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {job.result != null && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded overflow-x-auto text-sm">
              {JSON.stringify(job.result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            onClick={handleRerun}
            disabled={job.status === 'queued'}
          >
            Rerun Job
          </Button>
          {job.status === 'running' && (
            <Button variant="destructive" onClick={handleCancel}>
              Cancel Job
            </Button>
          )}
          {['finished', 'queued', 'errored', 'cancelled', 'delayed'].includes(job.status) && (
            <Button variant="destructive" onClick={handleDelete}>
              Delete Job
            </Button>
          )}
        </CardContent>
      </Card>

      {job.logs && job.logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Job Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {job.logs.map((log, index) => (
                <div key={index} className="text-sm font-mono border-b py-2 last:border-0">
                  <span className="text-muted-foreground mr-2">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <Badge variant={log.level === 'error' ? 'destructive' : 'outline'} className="mr-2">
                    {log.level}
                  </Badge>
                  <span className={log.level === 'error' ? 'text-destructive' : ''}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default async function JobDetailsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return (
    <AdminLayout>
      <JobDetailsContent jobId={jobId} />
    </AdminLayout>
  );
}
