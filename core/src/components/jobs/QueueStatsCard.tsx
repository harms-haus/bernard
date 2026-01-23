'use client';

import { Activity, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { QueueStats } from '@/lib/infra/worker-queue/types';

interface QueueStatsCardProps {
  stats: QueueStats;
}

export function QueueStatsCard({ stats }: QueueStatsCardProps) {
  const statItems = [
    { label: 'Queued', value: stats.queued, icon: Clock, color: 'text-yellow-500' },
    { label: 'Running', value: stats.running, icon: Activity, color: 'text-blue-500' },
    { label: 'Completed', value: stats.finished, icon: CheckCircle2, color: 'text-green-500' },
    { label: 'Errored', value: stats.errored, icon: XCircle, color: 'text-red-500' },
    { label: 'Delayed', value: stats.delayed, icon: AlertCircle, color: 'text-orange-500' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-4">
          {statItems.map((item) => (
            <div key={item.label} className="text-center">
              <item.icon className={`h-6 w-6 mx-auto ${item.color}`} />
              <div className="text-2xl font-bold mt-2">{item.value}</div>
              <div className="text-sm text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
          Total Jobs: {stats.total}
        </div>
      </CardContent>
    </Card>
  );
}
