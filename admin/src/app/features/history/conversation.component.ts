import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { finalize, interval, Subscription } from 'rxjs';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { ConversationDetail, ConversationMessage } from '../../data/models';

type ToolCall = NonNullable<ConversationMessage['tool_calls']>[number];

@Component({
  selector: 'app-conversation',
  imports: [CommonModule, ButtonModule, TagModule, MessageModule],
  templateUrl: './conversation.component.html',
  styleUrl: './conversation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private pollSub: Subscription | null = null;

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly conversation = signal<ConversationDetail | null>(null);
  readonly messages = signal<ConversationMessage[]>([]);
  readonly expandedToolCalls = signal<Set<string>>(new Set());

  readonly isActive = computed(() => this.conversation()?.status === 'open');

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        this.error.set('Missing conversation id');
        this.loading.set(false);
        return;
      }
      this.load(id, true);
      this.startPolling(id);
    });
  }

  back() {
    void this.router.navigate(['/history']);
  }

  renderContent(message: ConversationMessage): string {
    const content = message.content;
    if (typeof content === 'string') {
      return content;
    }
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }

  toolCallArguments(call: ToolCall): { text: string; parsed: boolean } {
    const args = call.arguments;
    if (!args) return { text: '(no arguments)', parsed: true };
    if (typeof args === 'string') {
      try {
        return { text: JSON.stringify(JSON.parse(args), null, 2), parsed: true };
      } catch {
        return { text: args, parsed: false };
      }
    }
    if (typeof args === 'object') {
      try {
        return { text: JSON.stringify(args, null, 2), parsed: true };
      } catch {
        return { text: String(args), parsed: false };
      }
    }
    return { text: String(args), parsed: false };
  }

  inlineToolCallArguments(call: ToolCall): string {
    const { text } = this.toolCallArguments(call);
    if (!text) return '';
    const firstLine = text.split('\n')[0] ?? '';
    return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
  }

  toolCallRaw(call: ToolCall): string {
    if (typeof call.arguments === 'string') return call.arguments;
    try {
      return JSON.stringify(call, null, 2);
    } catch {
      return String(call.arguments ?? call);
    }
  }

  toggleToolCall(callId: string) {
    this.expandedToolCalls.update((current) => {
      const next = new Set(current);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  }

  isToolCallExpanded(callId: string) {
    return this.expandedToolCalls().has(callId);
  }

  toolCallLabel(call: ToolCall) {
    return call.name || 'Tool call';
  }

  messageLabel(message: ConversationMessage) {
    if (message.role === 'assistant') {
      return 'Assistant';
    }
    if (message.role === 'tool') {
      return 'Tool';
    }
    if (message.role === 'system') {
      return 'System';
    }
    return 'User';
  }

  messageSeverity(message: ConversationMessage) {
    if (message.role === 'assistant') {
      return 'success';
    }
    if (message.role === 'tool') {
      return 'warning';
    }
    if (message.role === 'system') {
      return 'secondary';
    }
    return 'info';
  }

  private load(id: string, withLoader: boolean) {
    if (withLoader) {
      this.loading.set(true);
    }
    this.api
      .getConversation(id)
      .pipe(
        takeUntilDestroyed(),
        finalize(() => {
          if (withLoader) {
            this.loading.set(false);
          }
        })
      )
      .subscribe({
        next: (value) => {
          this.conversation.set(value.conversation);
          this.messages.set(value.messages ?? []);
          this.error.set(null);
          if (!withLoader) {
            this.loading.set(false);
          }
        },
        error: () => {
          this.error.set('Unable to load conversation');
          this.loading.set(false);
        }
      });
  }

  private startPolling(id: string) {
    this.stopPolling();
    this.pollSub = interval(2500)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        const convo = this.conversation();
        if (!convo || convo.status !== 'open') {
          return;
        }
        this.load(id, false);
      });
  }

  private stopPolling() {
    if (this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = null;
    }
  }
}

