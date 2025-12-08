import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { DialogModule } from 'primeng/dialog';
import { type MenuItem } from 'primeng/api';
import { MenuModule, type Menu } from 'primeng/menu';
import { Router } from '@angular/router';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { ConversationListItem } from '../../data/models';

@Component({
  selector: 'app-history',
  imports: [CommonModule, TableModule, ButtonModule, TagModule, MessageModule, DialogModule, MenuModule],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistoryComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly conversations = signal<ConversationListItem[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly stats = signal<{ total: number; active: number; closed: number }>({
    total: 0,
    active: 0,
    closed: 0
  });
  readonly deletingId = signal<string | null>(null);
  readonly confirmVisible = signal<boolean>(false);
  readonly pendingConversation = signal<ConversationListItem | null>(null);

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api
      .listHistory({ includeOpen: true, includeClosed: true })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
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

  menuItems(conversation: ConversationListItem): MenuItem[] {
    return [
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        command: () => this.promptDelete(conversation)
      }
    ];
  }


  promptDelete(conversation: ConversationListItem) {
    this.pendingConversation.set(conversation);
    this.confirmVisible.set(true);
  }

  cancelDelete() {
    this.confirmVisible.set(false);
    this.pendingConversation.set(null);
  }

  confirmDelete() {
    const conversation = this.pendingConversation();
    if (!conversation) {
      this.cancelDelete();
      return;
    }
    this.deletingId.set(conversation.id);
    this.api
      .deleteConversation(conversation.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.deletingId.set(null);
          this.confirmVisible.set(false);
          this.pendingConversation.set(null);
        })
      )
      .subscribe({
        next: () => {
          this.conversations.set(this.conversations().filter((c) => c.id !== conversation.id));
          this.stats.update((current) => ({
            total: Math.max(0, current.total - 1),
            active: conversation.status === 'open' ? Math.max(0, current.active - 1) : current.active,
            closed: conversation.status === 'closed' ? Math.max(0, current.closed - 1) : current.closed
          }));
          this.error.set(null);
        },
        error: () => this.error.set('Unable to delete conversation')
      });
  }
}
