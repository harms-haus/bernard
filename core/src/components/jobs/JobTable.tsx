'use client';

import { CheckCircle2, Clock, Loader2, Settings2, XCircle, X, RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { JobHistory } from '@/lib/infra/worker-queue/types';

interface JobTableProps {
  jobs: JobHistory[];
  onViewDetails: (jobId: string) => void;
  onRerun: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onDelete: (jobId: string) => void;
}

const statusConfig = {
  queued: { color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', icon: Clock, animate: 'animate-pulse' },
  starting: { color: 'bg-blue-500/20 text-blue-500 border-blue-500/30', icon: Loader2, animate: 'animate-spin' },
  running: { color: 'bg-blue-500/20 text-blue-500 border-blue-500/30', icon: Loader2, animate: 'animate-spin' },
  'cleaning-up': { color: 'bg-purple-500/20 text-purple-500 border-purple-500/30', icon: Settings2, animate: 'animate-spin' },
  finished: { color: 'bg-green-500/20 text-green-500 border-green-500/30', icon: CheckCircle2, animate: '' },
  errored: { color: 'bg-red-500/20 text-red-500 border-red-500/30', icon: XCircle, animate: '' },
  cancelled: { color: 'bg-gray-500/20 text-gray-500 border-gray-500/30', icon: X, animate: '' },
  delayed: { color: 'bg-orange-500/20 text-orange-500 border-orange-500/30', icon: Clock, animate: '' },
};

export function JobTable({ jobs, onViewDetails, onRerun, onCancel, onDelete }: JobTableProps) {
  const formatDuration = (ms?: number) => {
    if (ms == null || ms === undefined) return '-';
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
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium">Job ID</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Queued At</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Wait Time</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Run Time</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Attempts</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const config = statusConfig[job.status] || {
              color: 'bg-gray-500/20 text-gray-500 border-gray-500/30',
              icon: Clock,
              animate: '',
            };
            const StatusIcon = config.icon;
            return (
              <tr key={job.jobId} className="border-t hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-sm font-mono">
                  {job.jobId.slice(0, 8)}...
                </td>
                <td className="px-4 py-3 text-sm">
                  <Badge variant="outline">{getJobTypeLabel(job.type)}</Badge>
                </td>
                <td className="px-4 py-3 text-sm">
                  <Badge className={config.color}>
                    <StatusIcon className={`h-3 w-3 mr-1 inline ${config.animate}`} />
                    {job.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(job.queuedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm">
                  {formatDuration(job.waitTimeMs)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {formatDuration(job.runTimeMs)}
                </td>
                <td className="px-4 py-3 text-sm">
                  <Badge variant="secondary">{job.attempts}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewDetails(job.jobId)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onRerun(job.jobId)}
                        disabled={job.status === 'queued'}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Rerun
                      </DropdownMenuItem>
                      {job.status === 'running' && (
                        <DropdownMenuItem
                          onClick={() => onCancel(job.jobId)}
                          className="text-destructive focus:text-destructive"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancel
                        </DropdownMenuItem>
                      )}
                      {['finished', 'queued', 'errored', 'cancelled', 'delayed'].includes(job.status) && (
                        <DropdownMenuItem
                          onClick={() => onDelete(job.jobId)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
