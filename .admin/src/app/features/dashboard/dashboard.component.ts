import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartData, ChartOptions } from 'chart.js';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { ChartModule } from 'primeng/chart';
import { MessageModule } from 'primeng/message';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { BernardStatus } from '../../data/models';

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule, TagModule, SkeletonModule, ChartModule, MessageModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class DashboardComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly datePipe = inject(DatePipe);
  private readonly colors = {
    brand: '#2563eb',
    accent: '#0ea5e9',
    amber: '#f59e0b',
    teal: '#10b981',
    grid: 'rgba(148, 163, 184, 0.2)'
  };
  private readonly throughputLabels = [
    '06:00',
    '08:00',
    '10:00',
    '12:00',
    '14:00',
    '16:00',
    '18:00',
    '20:00',
    '22:00',
    '00:00',
    '02:00',
    '04:00'
  ];

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly status = signal<BernardStatus | null>(null);

  readonly trafficSummary = signal({
    requestsToday: 182,
    requestsWeek: 1240,
    errorsToday: 4,
    successRate: 99.1
  });

  readonly requestSpark = signal<number[]>([42, 64, 58, 72, 68, 86, 94, 120, 104, 92, 88, 96]);
  readonly hourlyRequests = signal<number[]>([18, 24, 32, 40, 38, 52, 64, 72, 90, 82, 76, 68]);
  readonly hourlyToolCalls = signal<number[]>([4, 6, 9, 12, 10, 14, 18, 20, 24, 22, 18, 16]);
  readonly modelShare = signal([
    { label: 'Claude 3.5 Sonnet', value: 46, color: '#2563eb' },
    { label: 'GPT-4o', value: 32, color: '#0ea5e9' },
    { label: 'Mixtral 8x7B', value: 14, color: '#f59e0b' },
    { label: 'Tools-only', value: 8, color: '#10b981' }
  ]);
  readonly latency = signal([
    { label: 'p50', value: 820 },
    { label: 'p90', value: 1340 },
    { label: 'p95', value: 1760 },
    { label: 'max', value: 2240 }
  ]);
  readonly uptimePercent = signal<number>(99.96);

  readonly uptimeText = computed(() => this.formatDuration(this.status()?.uptimeSeconds));
  readonly lastSeen = computed(() => {
    const value = this.status()?.lastMessageAt;
    return value ? this.datePipe.transform(value, 'short') ?? '' : 'n/a';
  });
  readonly sparklinePercents = computed(() => {
    const values = this.requestSpark();
    const max = Math.max(...values);
    if (!max) {
      return values.map(() => 0);
    }
    return values.map((value) => Math.round((value / max) * 100));
  });
  readonly throughputChartData = computed<ChartData<'line'>>(() => ({
    labels: this.throughputLabels,
    datasets: [
      {
        label: 'Requests',
        data: this.hourlyRequests(),
        borderColor: this.colors.brand,
        backgroundColor: 'rgba(37, 99, 235, 0.12)',
        pointBackgroundColor: this.colors.brand,
        pointRadius: 3,
        tension: 0.35,
        fill: true
      },
      {
        label: 'Tool calls',
        data: this.hourlyToolCalls(),
        borderColor: this.colors.accent,
        backgroundColor: 'rgba(14, 165, 233, 0.12)',
        pointBackgroundColor: this.colors.accent,
        pointRadius: 3,
        tension: 0.35,
        fill: true
      }
    ]
  }));
  readonly modelShareData = computed<ChartData<'doughnut'>>(() => ({
    labels: this.modelShare().map((model) => model.label),
    datasets: [
      {
        data: this.modelShare().map((model) => model.value),
        backgroundColor: this.modelShare().map((model) => model.color),
        hoverBackgroundColor: this.modelShare().map((model) => model.color)
      }
    ]
  }));
  readonly latencyChartData = computed<ChartData<'bar'>>(() => ({
    labels: this.latency().map((bucket) => bucket.label.toUpperCase()),
    datasets: [
      {
        label: 'Latency (ms)',
        data: this.latency().map((bucket) => bucket.value),
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        borderColor: this.colors.brand,
        borderWidth: 1.5,
        borderRadius: 6
      }
    ]
  }));

  readonly throughputChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true }
      },
      tooltip: {
        intersect: false,
        mode: 'index'
      }
    },
    scales: {
      x: {
        grid: { display: false }
      },
      y: {
        grid: { color: this.colors.grid },
        ticks: { precision: 0 }
      }
    }
  };

  readonly modelShareOptions: ChartOptions<'doughnut'> = {
    cutout: '65%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${context.formattedValue}%`
        }
      }
    }
  };

  readonly latencyChartOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.x} ms`
        }
      }
    },
    scales: {
      x: {
        grid: { color: this.colors.grid },
        ticks: {
          callback: (value) => `${value} ms`
        }
      },
      y: {
        grid: { display: false }
      }
    }
  };

  constructor() {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    this.api
      .getStatus()
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (value) => {
          this.status.set(value);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load status')
      });
  }

  statusSeverity(status: BernardStatus | null) {
    if (!status) {
      return 'secondary';
    }
    if (status.status === 'online') {
      return 'success';
    }
    if (status.status === 'degraded') {
      return 'warning';
    }
    return 'danger';
  }

  private formatDuration(totalSeconds?: number | null) {
    if (!totalSeconds) {
      return 'n/a';
    }
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const parts = [
      days ? `${days}d` : null,
      hours ? `${hours}h` : null,
      minutes ? `${minutes}m` : null
    ].filter(Boolean);
    return parts.length ? parts.join(' ') : `${totalSeconds}s`;
  }
}
