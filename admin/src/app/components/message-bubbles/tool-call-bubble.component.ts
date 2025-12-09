import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ToolCall } from '../../data/models';
import { MessageBubbleComponent } from './message-bubble.component';

@Component({
  selector: 'app-tool-call-bubble',
  imports: [CommonModule, MessageBubbleComponent],
  template: `
    <app-message-bubble
      role="tool"
      align="start"
      [footer]="footer()"
      [expandable]="bubbleExpandable()"
      [hasExpandableHint]="bubbleExpandable()"
    >
      <div class="tool-block" message-bubble-content>
        <div class="tool-signature" [title]="signature()">{{ signature() }}</div>
      </div>

      @if (showExpandingContent()) {
        <div class="tool-block" message-bubble-expanding-content>
          <p class="content tool-response">{{ responseText() }}</p>
        </div>
      }
    </app-message-bubble>
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
  readonly collapsed = input<boolean>(false);

  protected readonly displayName = computed(() => this.name() ?? this.callName(this.call()));
  protected readonly signature = computed(() => this.buildSignature(this.displayName(), this.call()));
  protected readonly renderedContent = computed(() =>
    this.textOnly() ? this.safeStringify(this.content()) : this.content() ?? ''
  );
  protected readonly hasResponse = computed(() => this.content() !== null && this.content() !== undefined);
  protected readonly responseText = computed(() => {
    const rendered = this.renderedContent().trim();
    return rendered || '(no tool response)';
  });
  protected readonly bubbleExpandable = computed(
    () => !this.collapsed() && this.hasExpandableContent()
  );
  protected readonly showExpandingContent = computed(
    () => !this.collapsed() && this.hasExpandableContent()
  );
  protected readonly hasExpandableContent = computed(() => this.hasResponse());

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

  private buildSignature(name: string, call: ToolCall | null): string {
    const args = this.argumentValue(call);
    return `${name}${this.formatArgumentList(args)}`;
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

  private compact(value: string, max = 80): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    if (!singleLine) return '';
    return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
  }

  private formatArgumentList(args: unknown): string {
    const normalized = this.parseMaybeJson(args);
    if (normalized === undefined || normalized === null || normalized === '') return '()';
    return `(${this.formatValue(normalized)})`;
  }

  private formatValue(value: unknown, depth = 0): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return this.compact(value, 120);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    if (Array.isArray(value)) {
      if (depth > 1) return '[…]';
      const rendered = value.slice(0, 4).map((entry) => this.formatValue(entry, depth + 1)).join(', ');
      const suffix = value.length > 4 ? ', …' : '';
      return `[${rendered}${suffix}]`;
    }

    if (typeof value === 'object') {
      if (depth > 1) return '{…}';
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.length) return '{}';
      const rendered = entries
        .slice(0, 6)
        .map(([key, val]) => `${key}: ${this.formatValue(val, depth + 1)}`)
        .join(', ');
      const suffix = entries.length > 6 ? ' …' : '';
      return `${rendered}${suffix}`;
    }

    return this.compact(String(value), 120);
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value ?? '');
    }
  }

  private parseMaybeJson(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const looksLikeJson =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (!looksLikeJson) return value;
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
}

