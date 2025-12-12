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
import { ConversationDetail, ConversationMessage, ConversationIndexingStatus } from '../../data/models';
import { AssistantMessageBubbleComponent } from '../../components/message-bubbles/assistant-message-bubble.component';
import { SystemMessageBubbleComponent } from '../../components/message-bubbles/system-message-bubble.component';
import { ToolCallBubbleComponent } from '../../components/message-bubbles/tool-call-bubble.component';
import { UserMessageBubbleComponent } from '../../components/message-bubbles/user-message-bubble.component';
import { LlmCallComponent } from './llm-call/llm-call.component';
import { LlmTrace, ToolCall, TraceEntry, TraceTool } from './llm-call/llm-trace.types';

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
  toolLatencyMs?: unknown;
  tokens?: unknown;
  context?: unknown;
  result?: unknown;
  tools?: unknown;
  availableTools?: unknown;
  toolset?: unknown;
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

type TurnThread = {
  index: number;
  items: ThreadItem[];
  durationMs: number | null;
  durationLabel: string | null;
};

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
  readonly expandedErrors = signal<Set<string>>(new Set());
  readonly indexingActionInProgress = signal<'retry' | 'cancel' | 'none'>('none');

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

  readonly indexingStatus = computed(() => this.conversation()?.indexingStatus ?? 'none');
  readonly indexingStatusLabel = computed(() => {
    const status = this.indexingStatus();
    switch (status) {
      case 'none': return 'Not indexed';
      case 'queued': return 'Queued';
      case 'indexing': return 'Indexing';
      case 'indexed': return 'Indexed';
      case 'failed': return 'Failed';
      default: return 'Unknown';
    }
  });
  readonly indexingStatusSeverity = computed(() => {
    const status = this.indexingStatus();
    switch (status) {
      case 'none': return 'secondary';
      case 'queued': return 'info';
      case 'indexing': return 'warning';
      case 'indexed': return 'success';
      case 'failed': return 'danger';
      default: return 'secondary';
    }
  });
  readonly indexingStatusIcon = computed(() => {
    const status = this.indexingStatus();
    switch (status) {
      case 'none': return 'pi pi-circle';
      case 'queued': return 'pi pi-clock';
      case 'indexing': return 'pi pi-spin pi-spinner';
      case 'indexed': return 'pi pi-check-circle';
      case 'failed': return 'pi pi-exclamation-circle';
      default: return 'pi pi-question-circle';
    }
  });
  readonly canRetryIndexing = computed(() => {
    const status = this.indexingStatus();
    return status === 'none' || status === 'failed';
  });
  readonly canCancelIndexing = computed(() => {
    const status = this.indexingStatus();
    return status === 'queued' || status === 'indexing';
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
  readonly turns = computed<TurnThread[]>(() => {
    const items = this.threadItems();
    const turns: Array<{ index: number; items: ThreadItem[]; start?: number; end?: number }> = [];
    let current: { index: number; items: ThreadItem[]; start?: number; end?: number } | null = null;

    const beginTurn = () => {
      const nextIndex = (turns[turns.length - 1]?.index ?? 0) + 1;
      const turn = { index: nextIndex, items: [] as ThreadItem[] };
      turns.push(turn);
      current = turn;
    };

    items.forEach((item) => {
      const isUserStart = item.kind === 'user';
      if (isUserStart || !current) {
        beginTurn();
      }
      if (!current) return;

      current.items.push(item);
      const timestamp = this.itemTimestamp(item);
      if (timestamp !== null) {
        current.start = current.start !== undefined ? Math.min(current.start, timestamp) : timestamp;
        current.end = current.end !== undefined ? Math.max(current.end, timestamp) : timestamp;
      }
    });

    return turns.map((turn) => {
      const duration = turn.start !== undefined && turn.end !== undefined ? turn.end - turn.start : null;
      return {
        index: turn.index,
        items: turn.items,
        durationMs: duration,
        durationLabel: this.formatDuration(duration)
      };
    });
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

  errorPreview(message: ConversationMessage, max = 160): string {
    const text = this.renderContent(message).replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text || 'Error';
    return `${text.slice(0, max).trimEnd()}…`;
  }

  toggleError(id: string) {
    this.expandedErrors.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isErrorExpanded(id: string): boolean {
    return this.expandedErrors().has(id);
  }

  errorSolutions(message: ConversationMessage): string[] {
    const text = this.renderContent(message).toLowerCase();
    const hints = new Set<string>();

    const add = (hint: string) => {
      if (hint.trim()) hints.add(hint.trim());
    };

    if (text.includes('timeout')) {
      add('Check upstream services, network, and reduce context length if requests time out.');
    }
    if (text.includes('unauthorized') || text.includes('forbidden') || text.includes('401')) {
      add('Verify bearer tokens/API keys and ensure the request token has access.');
    }
    if (text.includes('fetch failed') || text.includes('connect') || text.includes('enotfound') || text.includes('econnrefused')) {
      add('Confirm the target endpoint is reachable and DNS/SSL are configured correctly.');
    }
    if (text.includes('intent halted')) {
      add('Check for repeated tool calls or invalid arguments; fix and retry the turn.');
    }
    if (text.includes('tool') && text.includes('failed')) {
      add('Inspect the tool invocation and credentials, then rerun after correcting inputs.');
    }
    if (text.includes('rate limit')) {
      add('Wait briefly or reduce request rate/context size to avoid rate limits.');
    }

    if (!hints.size) {
      add('Retry the turn after verifying upstream services, credentials, and tool configuration.');
    }

    return Array.from(hints);
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

  retryIndexing() {
    const conversation = this.conversation();
    if (!conversation || this.indexingActionInProgress() !== 'none') return;

    this.indexingActionInProgress.set('retry');
    this.api
      .retryIndexing(conversation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (result.success) {
            this.conversation.update((conv) =>
              conv ? { 
                ...conv, 
                indexingStatus: result.indexingStatus,
                indexingAttempts: (conv.indexingAttempts ?? 0) + 1,
                indexingError: undefined 
              } : null
            );
          } else {
            this.error.set(result.message || 'Unable to retry indexing');
          }
        },
        error: () => this.error.set('Unable to retry indexing'),
        complete: () => this.indexingActionInProgress.set('none')
      });
  }

  cancelIndexing() {
    const conversation = this.conversation();
    if (!conversation || this.indexingActionInProgress() !== 'none') return;

    this.indexingActionInProgress.set('cancel');
    this.api
      .cancelIndexing(conversation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (result.success) {
            this.conversation.update((conv) =>
              conv ? { 
                ...conv, 
                indexingStatus: result.indexingStatus,
                indexingError: undefined 
              } : null
            );
          } else {
            this.error.set(result.message || 'Unable to cancel indexing');
          }
        },
        error: () => this.error.set('Unable to cancel indexing'),
        complete: () => this.indexingActionInProgress.set('none')
      });
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
    const toolLatencyMs = typeof content.toolLatencyMs === 'number' ? content.toolLatencyMs : undefined;
    const tokens = this.isRecord(content.tokens) ? (content.tokens as Record<string, unknown>) : undefined;
    const tools = this.parseTraceTools(
      (content as { tools?: unknown }).tools ??
        (content as { availableTools?: unknown }).availableTools ??
        (content as { toolset?: unknown }).toolset
    );

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
      toolLatencyMs,
      tokens,
      context: contextEntries as TraceEntry[],
      result: resultEntries as TraceEntry[],
      ...(tools.length ? { tools } : {}),
      raw: content
    };
  }

  private parseTraceTools(value: unknown): TraceTool[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((tool, index) => this.toTraceTool(tool, index))
      .filter((tool): tool is TraceTool => Boolean(tool));
  }

  private toTraceTool(tool: unknown, index: number): TraceTool | null {
    if (!this.isRecord(tool)) return null;
    const fn = this.isRecord((tool as { function?: unknown }).function)
      ? ((tool as { function?: Record<string, unknown> }).function ?? undefined)
      : undefined;

    const nameValue =
      (tool as { name?: unknown }).name ??
      (fn as { name?: unknown })?.name ??
      (tool as { id?: unknown }).id ??
      (fn as { id?: unknown })?.id;
    const name =
      typeof nameValue === 'string' && nameValue.trim()
        ? nameValue.trim()
        : typeof nameValue === 'number'
          ? String(nameValue)
          : null;
    if (!name) return null;

    const descriptionValue =
      (tool as { description?: unknown }).description ?? (fn as { description?: unknown })?.description;
    const description = typeof descriptionValue === 'string' ? descriptionValue : undefined;

    const parameters =
      (tool as { parameters?: unknown }).parameters ??
      (tool as { args?: unknown }).args ??
      (tool as { input?: unknown }).input ??
      (tool as { schema?: unknown }).schema ??
      (fn as { parameters?: unknown })?.parameters ??
      (fn as { args?: unknown })?.args ??
      (fn as { input?: unknown })?.input ??
      (fn as { schema?: unknown })?.schema;

    return {
      id: `${name}:${index}`,
      name,
      description,
      parameters,
      raw: tool
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

  private itemTimestamp(item: ThreadItem): number | null {
    switch (item.kind) {
      case 'llm-call':
        return this.parseTimestamp(item.createdAt);
      case 'error':
      case 'user':
      case 'assistant-text':
      case 'system':
        return this.parseTimestamp(item.message.createdAt);
      case 'tool-interaction': {
        const sourceTime = this.parseTimestamp(item.source.createdAt);
        const responseTime = item.response ? this.parseTimestamp(item.response.createdAt) : null;
        return responseTime ?? sourceTime;
      }
      default:
        return null;
    }
  }

  private parseTimestamp(value: string | null | undefined): number | null {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  private formatDuration(durationMs: number | null): string | null {
    if (durationMs === null) return null;
    if (durationMs < 1000) return `${durationMs}ms`;

    const seconds = durationMs / 1000;
    if (seconds < 60) {
      return seconds >= 10 ? `${seconds.toFixed(1)}s` : `${seconds.toFixed(2)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds - minutes * 60);
    if (minutes < 60) {
      return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes - hours * 60;
    if (remainingMinutes === 0) return `${hours}h`;
    return `${hours}h ${remainingMinutes}m`;
  }
}

