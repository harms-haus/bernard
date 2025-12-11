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
  readonly closingId = signal<string | null>(null);
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

  hasErrors(conversation: ConversationListItem): boolean {
    return conversation.hasErrors ?? ((conversation.errorCount ?? 0) > 0);
  }

  messageCount(conversation: ConversationListItem): number {
    return conversation.userAssistantCount ?? conversation.messageCount ?? 0;
  }

  formatLatencyMs(value: number | undefined | null): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    if (value < 1000) return `${value} ms`;
    const seconds = value / 1000;
    if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 1 : 2)} s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds - minutes * 60);
    return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  menuItems(conversation: ConversationListItem): MenuItem[] {
    const disabled = this.deletingId() === conversation.id || this.closingId() === conversation.id;
    return [
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        disabled,
        command: () => this.promptDelete(conversation)
      }
    ];
  }

  closeConversation(conversation: ConversationListItem) {
    if (this.closingId() === conversation.id) return;

    this.closingId.set(conversation.id);
    this.api
      .closeConversation(conversation.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.closingId.set(null))
      )
      .subscribe({
        next: (updated) => {
          this.conversations.update((current) =>
            current.map((item) => (item.id === conversation.id ? { ...item, ...updated, status: 'closed' } : item))
          );
          this.stats.update((current) => ({
            total: current.total,
            active: conversation.status === 'open' ? Math.max(0, current.active - 1) : current.active,
            closed: conversation.status === 'open' ? current.closed + 1 : current.closed
          }));
          this.error.set(null);
        },
        error: () => this.error.set('Unable to close conversation')
      });
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
