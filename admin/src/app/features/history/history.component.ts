import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { Router } from '@angular/router';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { ConversationListItem } from '../../data/models';

@Component({
  selector: 'app-history',
  imports: [CommonModule, TableModule, ButtonModule, TagModule, MessageModule],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistoryComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly router = inject(Router);

  readonly conversations = signal<ConversationListItem[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly stats = signal<{ total: number; active: number; closed: number }>({
    total: 0,
    active: 0,
    closed: 0
  });

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api
      .listHistory({ includeOpen: true, includeClosed: true })
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (value) => {
          this.conversations.set(value.items ?? []);
          this.stats.set({
            total: value.total ?? value.items.length ?? 0,
            active: value.activeCount ?? 0,
            closed: value.closedCount ?? 0
          });
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load history')
      });
  }

  open(conversation: ConversationListItem) {
    void this.router.navigate(['/history', conversation.id]);
  }

  navigateFromKey(event: Event, conversation: ConversationListItem) {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    this.open(conversation);
  }

  statusLabel(status: ConversationListItem['status']) {
    return status === 'open' ? 'Active' : 'Closed';
  }
}
