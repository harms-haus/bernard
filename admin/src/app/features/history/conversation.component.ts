import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { TooltipModule } from 'primeng/tooltip';
import { finalize, interval, Subscription } from 'rxjs';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { ConversationDetail, ConversationMessage } from '../../data/models';

type ToolCall = NonNullable<ConversationMessage['tool_calls']>[number];

type TraceEntry = {
  id: string;
  role: ConversationMessage['role'];
  name?: string;
  content: unknown;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  raw: unknown;
};

type LlmTrace = {
  type: 'llm_call';
  model?: string;
  at?: string;
  latencyMs?: number;
  tokens?: Record<string, unknown>;
  context: TraceEntry[];
  result: TraceEntry[];
  raw: unknown;
};

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

@Component({
  selector: 'app-conversation',
  imports: [CommonModule, ButtonModule, TagModule, MessageModule, TooltipModule],
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
  readonly textOnlyMessages = signal<Set<string>>(new Set());
  readonly contextExpanded = signal<Set<string>>(new Set());
  readonly resultCollapsed = signal<Set<string>>(new Set());

  readonly isActive = computed(() => this.conversation()?.status === 'open');
  readonly lastRequestAt = computed(() => {
    const convo = this.conversation();
    return convo?.lastRequestAt || convo?.lastTouchedAt || convo?.startedAt || null;
  });
  readonly idTooltip = computed(() => {
    const id = this.conversation()?.id;
    return id ? `ID: ${id}` : 'ID not available';
  });

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
    return this.renderValue(message.content);
  }

  private argumentValue(call: ToolCall): unknown {
    const fn = call.function && typeof call.function === 'object' ? call.function : undefined;
    if (fn?.arguments !== undefined) return fn.arguments;
    if (call.arguments !== undefined) return call.arguments;
    if (call.args !== undefined) return call.args;
    if (fn?.args !== undefined) return fn.args;
    if ((call as { input?: unknown }).input !== undefined) return (call as { input?: unknown }).input;
    if ((fn as { input?: unknown })?.input !== undefined) return (fn as { input?: unknown }).input;
    return undefined;
  }

  toolCallArguments(call: ToolCall): { text: string; parsed: boolean } {
    const raw = this.argumentValue(call);
    if (raw === undefined || raw === null || raw === '') return { text: '(no arguments)', parsed: true };
    if (typeof raw === 'string') {
      try {
        return { text: JSON.stringify(JSON.parse(raw), null, 2), parsed: true };
      } catch {
        return { text: raw, parsed: false };
      }
    }
    if (typeof raw === 'object') {
      try {
        return { text: JSON.stringify(raw, null, 2), parsed: true };
      } catch {
        return { text: String(raw), parsed: false };
      }
    }
    return { text: String(raw), parsed: false };
  }

  inlineToolCallArguments(call: ToolCall): string {
    const raw = this.rawArgumentText(call);
    if (raw) return raw;
    const { text } = this.toolCallArguments(call);
    return text;
  }

  toolCallRaw(call: ToolCall): string {
    const raw = this.rawArgumentText(call);
    if (raw) return raw;
    try {
      return JSON.stringify(call, null, 2);
    } catch {
      return String(this.argumentValue(call) ?? call);
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

  toggleTextOnly(id: string) {
    this.textOnlyMessages.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isTextOnly(id: string) {
    return this.textOnlyMessages().has(id);
  }

  toggleContextSection(messageId: string) {
    this.contextExpanded.update((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }

  isContextExpanded(messageId: string) {
    return this.contextExpanded().has(messageId);
  }

  toggleResultSection(messageId: string) {
    this.resultCollapsed.update((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }

  isResultCollapsed(messageId: string) {
    return this.resultCollapsed().has(messageId);
  }

  toolCallLabel(call: ToolCall) {
    return call.name || call.function?.name || 'Tool call';
  }

  private rawArgumentText(call: ToolCall): string | null {
    const raw = this.argumentValue(call);
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'string') return raw;
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }

  messageLabel(message: { role: ConversationMessage['role'] }) {
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

  messageSeverity(message: { role: ConversationMessage['role'] }) {
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

  traceEntryContent(entry: TraceEntry): string {
    return this.renderValue(entry.content);
  }

  isResultEntryEmpty(entry: TraceEntry) {
    const rendered = this.renderValue(entry.content);
    const hasContent = rendered.trim().length > 0;
    const hasToolCalls = Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0;
    return !hasContent && !hasToolCalls;
  }

  messagePreview(message: ConversationMessage): string {
    return this.renderContent(message);
  }

  rawMessage(message: ConversationMessage): string {
    return this.safeStringify(message);
  }

  rawTrace(trace: LlmTrace): string {
    return this.safeStringify(trace.raw);
  }

  rawTraceEntry(entry: TraceEntry): string {
    return this.safeStringify(entry.raw);
  }

  private renderValue(content: unknown): string {
    if (typeof content === 'string') return content;
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content ?? '');
    }
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

