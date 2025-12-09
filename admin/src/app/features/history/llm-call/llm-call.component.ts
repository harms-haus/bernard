import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';

import { ToolCall, TraceEntry, LlmTrace } from './llm-trace.types';
import { AssistantMessageBubbleComponent } from '../../../components/message-bubbles/assistant-message-bubble.component';
import { SystemMessageBubbleComponent } from '../../../components/message-bubbles/system-message-bubble.component';
import { ToolCallBubbleComponent } from '../../../components/message-bubbles/tool-call-bubble.component';
import { UserMessageBubbleComponent } from '../../../components/message-bubbles/user-message-bubble.component';

@Component({
  selector: 'app-llm-call',
  imports: [
    CommonModule,
    ButtonModule,
    AssistantMessageBubbleComponent,
    SystemMessageBubbleComponent,
    ToolCallBubbleComponent,
    UserMessageBubbleComponent
  ],
  templateUrl: './llm-call.component.html',
  styleUrl: './llm-call.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LlmCallComponent {
  readonly trace = input.required<LlmTrace>();
  readonly createdAt = input<string | null>(null);

  protected readonly expanded = signal<boolean>(false);
  protected readonly contextExpanded = signal<boolean>(false);
  protected readonly resultCollapsed = signal<boolean>(false);
  protected readonly textOnly = signal<boolean>(false);
  protected readonly copied = signal<boolean>(false);

  protected readonly modelLabel = computed(() => this.trace().model ?? 'LLM call');
  protected readonly timestampValue = computed(() => this.trace().at ?? this.createdAt());
  protected readonly latencyLabel = computed(() => this.latencyText(this.trace().latencyMs));
  protected readonly tokenSummaryLabel = computed(() => this.tokenSummary(this.trace().tokens));
  protected readonly contextEntries = computed(() => this.trace().context ?? []);
  protected readonly resultEntries = computed(() => this.trace().result ?? []);

  toggleExpanded() {
    this.expanded.update((current) => !current);
  }

  toggleContext() {
    this.contextExpanded.update((current) => !current);
  }

  toggleResult() {
    this.resultCollapsed.update((current) => !current);
  }

  toggleTextOnly() {
    this.textOnly.update((current) => !current);
  }

  async copyTrace() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    const text = this.safeStringify(this.trace().raw ?? this.trace());
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (error) {
      console.error('Unable to copy trace', error);
      this.copied.set(false);
    }
  }

  protected entryText(entry: TraceEntry): string {
    return this.textOnly() ? this.safeStringify(entry.raw) : this.renderValue(entry.content);
  }

  protected entryFooter(entry: TraceEntry): string {
    const role = this.roleLabel(entry.role);
    return entry.tool_call_id ? `${role} • ${entry.tool_call_id}` : role;
  }

  protected isEntryEmpty(entry: TraceEntry): boolean {
    const rendered = this.renderValue(entry.content);
    const hasContent = rendered.trim().length > 0;
    const hasToolCalls = Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0;
    return !hasContent && !hasToolCalls;
  }

  protected toolCallFromEntry(entry: TraceEntry): ToolCall | null {
    if (Array.isArray(entry.tool_calls) && entry.tool_calls.length) {
      return entry.tool_calls[entry.tool_calls.length - 1] as ToolCall;
    }
    return null;
  }

  protected tokenSummary(tokens: Record<string, unknown> | undefined): string | null {
    if (!tokens) return null;
    const tokenIn = this.numberOrNull(tokens['in']);
    const tokenOut = this.numberOrNull(tokens['out']);
    const total = this.numberOrNull(tokens['total']) ?? this.sumNumbers(tokenIn, tokenOut);

    if (tokenIn === null && tokenOut === null && total === null) return null;

    const parts: string[] = [];
    parts.push(`Tokens in: ${tokenIn ?? '—'}`);
    parts.push(`out: ${tokenOut ?? '—'}`);
    parts.push(`total: ${total ?? this.sumNumbers(tokenIn, tokenOut) ?? '—'}`);

    return parts.join(' ');
  }

  protected roleLabel(role: TraceEntry['role']): string {
    if (role === 'assistant') return 'Assistant';
    if (role === 'user') return 'User';
    if (role === 'system') return 'System';
    if (role === 'tool') return 'Tool';
    return role;
  }

  protected hasEntryContent(entry: TraceEntry): boolean {
    const rendered = this.renderValue(entry.content);
    return rendered.trim().length > 0;
  }

  protected latencyText(latencyMs: number | undefined): string {
    if (typeof latencyMs === 'number' && Number.isFinite(latencyMs)) {
      return `${Math.round(latencyMs)}ms`;
    }
    return '—';
  }

  private numberOrNull(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return null;
  }

  private sumNumbers(...values: Array<number | null>): number | null {
    const valid = values.filter((v): v is number => typeof v === 'number');
    if (!valid.length) return null;
    return valid.reduce((sum, v) => sum + v, 0);
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
}

