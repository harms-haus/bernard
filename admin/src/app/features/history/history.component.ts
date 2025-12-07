import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { Conversation } from '../../data/models';

@Component({
  selector: 'app-history',
  imports: [CommonModule, TableModule, ButtonModule, TagModule, InputTextModule],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistoryComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);

  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly expandedId = signal<string | null>(null);
  protected readonly search = signal<string>('');

  constructor() {
    this.load();
  }

  protected load() {
    this.loading.set(true);
    this.api
      .listHistory({ search: this.search() })
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (value) => {
          this.conversations.set(value.items);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load history')
      });
  }

  protected onSearch(term: string) {
    this.search.set(term.trim());
    this.load();
  }

  protected toggle(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  protected statusSeverity(status: Conversation['status']) {
    if (status === 'completed') {
      return 'success';
    }
    if (status === 'running') {
      return 'info';
    }
    return 'danger';
  }
}
