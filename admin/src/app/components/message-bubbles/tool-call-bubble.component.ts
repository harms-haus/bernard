import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { ToolCall } from '../../data/models';
import { MessageBubbleShellComponent } from './message-bubble-shell.component';

@Component({
  selector: 'app-tool-call-bubble',
  imports: [CommonModule, MessageBubbleShellComponent],
  template: `
    <app-message-bubble-shell role="tool" align="start" [footer]="footer()">
      <div class="tool-block">
        <button
          type="button"
          class="tool-header"
          (click)="toggleExpanded()"
          [attr.aria-expanded]="isExpanded()"
        >
          <div class="tool-meta">
            <div class="tool-name">{{ displayName() }}</div>
            @if (callId()) {
              <div class="tool-id">ID: {{ callId() }}</div>
            }
          </div>
          <div class="tool-inline">
            <span class="tool-args-inline">{{ inlineArgs() || 'View call' }}</span>
            <span class="chevron" [class.expanded]="isExpanded()">{{ isExpanded() ? '▴' : '▾' }}</span>
          </div>
        </button>

        @if (showArguments()) {
          <pre class="content tool-call-args">{{ argumentText() }}</pre>
        }

        @if (hasContent()) {
          <pre class="content tool-response">{{ renderedContent() }}</pre>
        }

        @if (textOnly() && rawCall()) {
          <pre class="content raw-call">{{ rawCall() }}</pre>
        }
      </div>
    </app-message-bubble-shell>
  `,
  styleUrl: './tool-call-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToolCallBubbleComponent {
  readonly call = input<ToolCall | null>(null);
  readonly content = input<string | null>(null);
  readonly name = input<string | null>(null);
  readonly footer = input<string | null>(null);
  readonly textOnly = input<boolean>(false);

  private readonly expanded = signal<boolean>(false);

  protected readonly displayName = computed(() => this.name() ?? this.callName(this.call()));
  protected readonly callId = computed(() => this.resolveCallId(this.call()));
  protected readonly inlineArgs = computed(() => this.inlineArguments(this.call()));
  protected readonly argumentText = computed(() => this.describeArguments(this.call()));
  protected readonly rawCall = computed(() => this.safeStringify(this.call()));
  protected readonly renderedContent = computed(() =>
    this.textOnly() ? this.safeStringify(this.content()) : this.content() ?? ''
  );
  protected readonly isExpanded = computed(() => this.expanded());

  protected readonly showArguments = computed(() => this.expanded() || this.textOnly());
  protected readonly hasContent = computed(() => Boolean(this.content()));

  toggleExpanded() {
    this.expanded.update((current) => !current);
  }

  private callName(call: ToolCall | null): string {
    if (!call) return 'Tool call';
    const explicit = call.name ?? call.function?.name;
    if (typeof explicit === 'string' && explicit.trim()) {
      return explicit.trim();
    }
    if (typeof call.type === 'string' && call.type.trim()) {
      return call.type.trim();
    }
    return 'Tool call';
  }

  private resolveCallId(call: ToolCall | null): string | null {
    if (!call) return null;
    if (call.id && typeof call.id === 'string') return call.id;
    const toolCallId = (call as { tool_call_id?: unknown })['tool_call_id'];
    if (typeof toolCallId === 'string' && toolCallId) return toolCallId;
    if (call.function?.name && typeof call.function.name === 'string') return call.function.name;
    if (typeof call.type === 'string') return call.type;
    return null;
  }

  private inlineArguments(call: ToolCall | null): string {
    const raw = this.argumentValue(call);
    if (raw === undefined || raw === null) return '';
    if (typeof raw === 'string') return this.compact(raw, 80);
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);

    if (Array.isArray(raw)) {
      const preview = raw
        .slice(0, 3)
        .map((entry) => (typeof entry === 'string' ? this.compact(entry, 24) : JSON.stringify(entry)))
        .join(', ');
      return this.compact(preview, 80);
    }

    try {
      return this.compact(JSON.stringify(raw), 80);
    } catch {
      return this.compact(String(raw), 80);
    }
  }

  private describeArguments(call: ToolCall | null): string {
    const raw = this.argumentValue(call);
    if (raw === undefined || raw === null || raw === '') return '(no arguments)';
    if (typeof raw === 'string') {
      return this.tryParseJson(raw);
    }
    return this.safeStringify(raw);
  }

  private argumentValue(call: ToolCall | null): unknown {
    if (!call) return undefined;
    const fn = call.function && typeof call.function === 'object' ? call.function : undefined;
    if (fn?.arguments !== undefined) return fn.arguments;
    if (call.arguments !== undefined) return call.arguments;
    if (call.args !== undefined) return call.args;
    if (fn?.args !== undefined) return fn.args;
    if ((call as { input?: unknown }).input !== undefined) return (call as { input?: unknown }).input;
    if ((fn as { input?: unknown })?.input !== undefined) return (fn as { input?: unknown }).input;
    return undefined;
  }

  private tryParseJson(value: string): string {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  private compact(value: string, max = 80): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    if (!singleLine) return '';
    return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value ?? '');
    }
  }
}

