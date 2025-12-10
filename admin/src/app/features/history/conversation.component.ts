import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from 'primeng/tooltip';
import { finalize } from 'rxjs';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { ConversationDetail, ConversationMessage } from '../../data/models';
import { AssistantMessageBubbleComponent } from '../../components/message-bubbles/assistant-message-bubble.component';
import { SystemMessageBubbleComponent } from '../../components/message-bubbles/system-message-bubble.component';
import { ToolCallBubbleComponent } from '../../components/message-bubbles/tool-call-bubble.component';
import { UserMessageBubbleComponent } from '../../components/message-bubbles/user-message-bubble.component';
import { LlmCallComponent } from './llm-call/llm-call.component';
import { LlmTrace, ToolCall, TraceEntry } from './llm-call/llm-trace.types';

type TraceEntryInput = {
  role?: unknown;
  name?: unknown;
  tool_call_id?: unknown;
  tool_calls?: unknown;
  content?: unknown;
};

type LlmCallContent = {
  type?: unknown;
  model?: unknown;
  at?: unknown;
  latencyMs?: unknown;
  tokens?: unknown;
  context?: unknown;
  result?: unknown;
};

type ToolInteractionThreadItem = {
  kind: 'tool-interaction';
  id: string;
  call: ToolCall | null;
  response: ConversationMessage | null;
  name?: string | null;
  source: ConversationMessage;
};

type ThreadItem =
  | { kind: 'llm-call'; id: string; trace: LlmTrace; createdAt: string | null }
  | { kind: 'error'; id: string; message: ConversationMessage }
  | { kind: 'user' | 'assistant-text' | 'system'; id: string; message: ConversationMessage }
  | ToolInteractionThreadItem;

@Component({
  selector: 'app-conversation',
  imports: [
    CommonModule,
    ButtonModule,
    TagModule,
    MessageModule,
    TooltipModule,
    AssistantMessageBubbleComponent,
    SystemMessageBubbleComponent,
    ToolCallBubbleComponent,
    UserMessageBubbleComponent,
    LlmCallComponent
  ],
  templateUrl: './conversation.component.html',
  styleUrl: './conversation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConversationComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly conversation = signal<ConversationDetail | null>(null);
  readonly messages = signal<ConversationMessage[]>([]);
  readonly copyStatus = signal<'idle' | 'success' | 'error'>('idle');

  readonly isActive = computed(() => this.conversation()?.status === 'open');
  readonly lastRequestAt = computed(() => {
    const convo = this.conversation();
    return convo?.lastRequestAt || convo?.lastTouchedAt || convo?.startedAt || null;
  });
  readonly idTooltip = computed(() => {
    const id = this.conversation()?.id;
    return id ? `ID: ${id}` : 'ID not available';
  });
  readonly transactionPayload = computed(() => {
    const convo = this.conversation();
    if (!convo) return null;
    return {
      conversation: convo,
      messages: this.messages()
    };
  });
  readonly transactionJson = computed(() => {
    const payload = this.transactionPayload();
    if (!payload) return null;
    return this.safeStringify(payload);
  });
  readonly copyButtonLabel = computed(() => (this.copyStatus() === 'success' ? 'Copied' : 'Copy transaction'));
  readonly copyButtonIcon = computed(() => (this.copyStatus() === 'success' ? 'pi pi-check' : 'pi pi-copy'));
  readonly copyStatusText = computed(() => {
    if (this.copyStatus() === 'success') return 'Copied conversation to clipboard';
    if (this.copyStatus() === 'error') return 'Unable to copy conversation';
    return '';
  });
  readonly threadItems = computed<ThreadItem[]>(() => {
    const list = this.messages();
    const responseByCallId = new Map<string, ConversationMessage>();
    list.forEach((message) => {
      if (message.role === 'tool' && typeof message.tool_call_id === 'string' && message.tool_call_id) {
        responseByCallId.set(message.tool_call_id, message);
      }
    });

    const usedResponses = new Set<string>();
    const items: ThreadItem[] = [];

    list.forEach((message) => {
      const trace = this.traceFor(message);
      if (trace) {
        items.push({
          kind: 'llm-call',
          id: message.id,
          trace,
          createdAt: message.createdAt ?? null
        });
        return;
      }

      if (message.role === 'assistant') {
        if (this.hasContent(message)) {
          items.push({ kind: 'assistant-text', id: message.id, message });
        }

        const calls = Array.isArray(message.tool_calls) ? (message.tool_calls as ToolCall[]) : [];
        calls.forEach((call, index) => {
          const callId = this.resolveCallId(call);
          const response = callId ? responseByCallId.get(callId) ?? null : null;
          if (response) {
            usedResponses.add(response.id);
          }
          items.push({
            kind: 'tool-interaction',
            id: `${message.id}:call:${callId ?? index}`,
            call,
            response,
            name: message.name ?? null,
            source: message
          });
        });
        return;
      }

      if (message.role === 'tool') {
        if (usedResponses.has(message.id)) return;
        items.push({
          kind: 'tool-interaction',
          id: message.id,
          call: this.toolCallFromMessage(message),
          response: message,
          name: message.name ?? null,
          source: message
        });
        return;
      }

      if (message.role === 'system') {
        const isError =
          message.name === 'orchestrator.error' ||
          message.metadata?.['traceType'] === 'error' ||
          message.metadata?.['traceType'] === 'orchestrator.error';
        items.push({ kind: isError ? 'error' : 'system', id: message.id, message });
        return;
      }

      items.push({ kind: 'user', id: message.id, message });
    });

    return items;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        this.error.set('Missing conversation id');
        this.loading.set(false);
        return;
      }
      this.load(id, true);
    });
  }

  back() {
    void this.router.navigate(['/history']);
  }

  async copyTransaction() {
    this.copyStatus.set('idle');
    const text = this.transactionJson();
    if (!text) {
      this.copyStatus.set('error');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      this.copyStatus.set('error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.copyStatus.set('success');
      setTimeout(() => this.copyStatus.set('idle'), 2000);
    } catch (error) {
      console.error('Unable to copy conversation', error);
      this.copyStatus.set('error');
      setTimeout(() => this.copyStatus.set('idle'), 2500);
    }
  }

  renderContent(message: ConversationMessage): string {
    return this.renderValue(message.content);
  }

  messageFooter(message: ConversationMessage): string {
    const role = this.roleLabel(message.role);
    if (!message.createdAt) return role;
    const date = new Date(message.createdAt);
    if (Number.isNaN(date.getTime())) return role;
    return `${role} • ${date.toLocaleString()}`;
  }

  hasContent(message: ConversationMessage): boolean {
    if (Array.isArray(message.tool_calls) && message.tool_calls.length) return false;
    const finishReason = (message.metadata as Record<string, unknown> | undefined)?.['finish_reason'];
    if (finishReason === 'tool_calls') return false;
    const value = message.content;
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }

  toolCallFromMessage(message: ConversationMessage): ToolCall | null {
    if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
      return message.tool_calls[message.tool_calls.length - 1] as ToolCall;
    }
    return null;
  }

  toolInteractionFooter(item: ToolInteractionThreadItem): string | null {
    const footerSource = item.response ?? item.source;
    return footerSource ? this.messageFooter(footerSource) : null;
  }

  toolInteractionContent(message: ConversationMessage | null): string {
    if (!message) return '';
    return this.renderValue(message.content);
  }

  roleLabel(role: ConversationMessage['role']) {
    if (role === 'assistant') {
      return 'Assistant';
    }
    if (role === 'tool') {
      return 'Tool';
    }
    if (role === 'system') {
      return 'System';
    }
    return 'User';
  }

  private load(id: string, withLoader: boolean) {
    if (withLoader) {
      this.loading.set(true);
    }
    this.api
      .getConversation(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
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

  traceFor(message: ConversationMessage): LlmTrace | null {
    const content = message.content;
    if (!this.isLlmCallContent(content)) return null;
    if (content.type !== 'llm_call') return null;

    const toEntry = (entry: unknown, index: number, kind: 'context' | 'result'): TraceEntry | null => {
      if (!this.isTraceEntryInput(entry)) return null;
      const role = this.parseRole(entry.role);
      const name = typeof entry.name === 'string' ? entry.name : undefined;
      const tool_call_id = typeof entry.tool_call_id === 'string' ? entry.tool_call_id : undefined;
      const tool_calls = Array.isArray(entry.tool_calls) ? (entry.tool_calls as ToolCall[]) : undefined;
      const id = `${message.id}:${kind}:${index}`;
      return {
        id,
        role,
        name,
        tool_call_id,
        tool_calls,
        content: entry.content ?? '',
        raw: entry
      };
    };

    const model = typeof content.model === 'string' ? content.model : undefined;
    const at = typeof content.at === 'string' ? content.at : undefined;
    const latencyMs = typeof content.latencyMs === 'number' ? content.latencyMs : undefined;
    const tokens = this.isRecord(content.tokens) ? (content.tokens as Record<string, unknown>) : undefined;

    const contextEntries = Array.isArray(content.context)
      ? content.context.map((entry, index) => toEntry(entry, index, 'context')).filter(Boolean)
      : [];
    const resultEntries = Array.isArray(content.result)
      ? content.result.map((entry, index) => toEntry(entry, index, 'result')).filter(Boolean)
      : [];

    return {
      type: 'llm_call',
      model,
      at,
      latencyMs,
      tokens,
      context: contextEntries as TraceEntry[],
      result: resultEntries as TraceEntry[],
      raw: content
    };
  }

  private renderValue(content: unknown): string {
    if (typeof content === 'string') return content;
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content ?? '');
    }
  }

  private resolveCallId(call: ToolCall | null): string | null {
    if (!call) return null;
    if (typeof call.id === 'string' && call.id) return call.id;
    const toolCallId = (call as { tool_call_id?: unknown }).tool_call_id;
    if (typeof toolCallId === 'string' && toolCallId) return toolCallId;
    if (call.function?.name && typeof call.function.name === 'string') return call.function.name;
    if (typeof call.type === 'string' && call.type) return call.type;
    return null;
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value ?? '');
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private isTraceEntryInput(value: unknown): value is TraceEntryInput {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private isLlmCallContent(value: unknown): value is LlmCallContent {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private parseRole(raw: unknown): ConversationMessage['role'] {
    if (raw === 'user' || raw === 'assistant' || raw === 'system' || raw === 'tool') {
      return raw;
    }
    return 'system';
  }
}

