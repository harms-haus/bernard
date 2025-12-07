import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { BernardStatus, RecordKeeperStatus } from '../../data/models';

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);

  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly status = signal<BernardStatus | null>(null);
  protected readonly recordKeeper = signal<RecordKeeperStatus | null>(null);

  protected readonly statusPayload = computed(() => this.formatPayload(this.status()));
  protected readonly recordKeeperPayload = computed(() => this.formatPayload(this.recordKeeper()));

  constructor() {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    forkJoin({
      status: this.api.getStatus(),
      rk: this.api.getRecordKeeperStatus()
    })
      .pipe(takeUntilDestroyed(), finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ status, rk }) => {
          this.status.set(status);
          this.recordKeeper.set(rk ?? status.recordKeeper);
          this.error.set(null);
        },
        error: () => {
          this.error.set('Unable to load status');
          this.status.set(null);
          this.recordKeeper.set(null);
        }
      });
  }

  private formatPayload(value: unknown): string {
    if (this.loading()) {
      return 'Loading status...';
    }
    const err = this.error();
    if (err) return err;
    if (!value) return 'No status yet.';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
