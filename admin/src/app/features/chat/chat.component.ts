import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { RippleModule } from 'primeng/ripple';
import { PrimeNGConfig } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';

import { environment } from '../../config/environment';

type ToolCallStatus = 'waiting' | 'in-progress' | 'ended-success' | 'ended-failure';

type ToolCallMessage = {
  kind: 'tool';
  id: string;
  role: 'tool';
  toolCallId: string;
  toolName: string;
  args: unknown;
  response?: string;
  status: ToolCallStatus;
  collapsed: boolean;
  createdAt: number;
};

type ChatMessage = {
  kind: 'chat';
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  pending?: boolean;
  createdAt: number;
};

type ChatItem = ChatMessage | ToolCallMessage;

@Component({
  selector: 'app-chat',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputTextareaModule,
    RippleModule,
    TagModule,
    MessageModule
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponent {
  private readonly fb = inject(FormBuilder);
  private readonly primeng = inject(PrimeNGConfig);
  private readonly tokenStorageKey = 'bernard:chatToken';
  private readonly endpointStorageKey = 'bernard:chatEndpoint';

  protected readonly messages = signal<ChatItem[]>([]);
  protected readonly sending = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly conversationId = signal<string>(this.createId());

  protected readonly form = this.fb.nonNullable.group({
    endpoint: [this.defaultEndpoint(), Validators.required],
    token: [this.defaultToken(), Validators.required],
    message: ['', Validators.required]
  });

  private readonly endpointValue = toSignal(this.form.controls.endpoint.valueChanges, {
    initialValue: this.form.controls.endpoint.value
  });
  private readonly messageValue = toSignal(this.form.controls.message.valueChanges, {
    initialValue: this.form.controls.message.value
  });

  protected readonly endpointLabel = computed(() => (this.endpointValue() ?? '').trim());
  protected readonly canSend = computed(() => {
    const message = (this.messageValue() ?? '').trim();
    return !this.sending() && Boolean(message);
  });

  constructor() {
    this.primeng.ripple = true;
  }

  protected resetConversation() {
    this.messages.set([]);
    this.conversationId.set(this.createId());
    this.error.set(null);
  }

  protected handleComposerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (this.canSend()) {
      void this.send();
    }
  }

  protected async send() {
    if (this.sending()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const endpoint = this.form.controls.endpoint.value.trim();
    const token = this.form.controls.token.value.trim();
    const text = this.form.controls.message.value.trim();

    if (!token) {
      this.error.set('Add a bearer token to chat with Bernard.');
      return;
    }
    if (!text) {
      return;
    }

    this.persistPreferences(token, endpoint);

    const userMessage: ChatMessage = {
      kind: 'chat',
      id: this.createId(),
      role: 'user',
      content: text,
      createdAt: Date.now()
    };
    const assistantId = this.createId();

    const history = [...this.messages(), userMessage];
    this.messages.set([
      ...history,
      {
        kind: 'chat',
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        pending: true
      }
    ]);
    this.form.controls.message.setValue('');
    this.sending.set(true);
    this.error.set(null);

    try {
      await this.streamResponse({
        endpoint,
        token,
        conversationId: this.conversationId(),
        history,
        assistantId
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.error.set(message);
      this.updateAssistant(assistantId, `Request failed: ${message}`, false);
    } finally {
      this.sending.set(false);
    }
  }

  private async streamResponse(params: {
    endpoint: string;
    token: string;
    conversationId: string;
    history: ChatItem[];
    assistantId: string;
  }) {
    const payload = {
      messages: this.toOpenAI(params.history),
      conversationId: params.conversationId,
      stream: true,
      clientMeta: { source: 'admin-chat' }
    };

    const response = await fetch(params.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${params.token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      await this.throwResponseError(response);
    }
    if (!response.body) {
      throw new Error('Missing response body from Bernard');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        this.updateAssistant(params.assistantId, this.assistantContent(params.assistantId), false);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        this.processSseEvent(raw, params.assistantId);
        boundary = buffer.indexOf('\n\n');
      }
    }
  }

  private processSseEvent(raw: string, assistantId: string) {
    const lines = raw.split('\n').filter((line) => line.startsWith('data:'));
    const payload = lines.map((line) => line.replace(/^data:\s*/, '')).join('');

    if (!payload) {
      return;
    }
    if (payload === '[DONE]') {
      this.updateAssistant(assistantId, this.assistantContent(assistantId), false);
      return;
    }

    try {
      const chunk = JSON.parse(payload);
      const errorMessage = this.extractErrorMessage(chunk);
      if (errorMessage) {
        this.error.set(errorMessage);
        this.markLatestToolFailure(errorMessage);
        this.updateAssistant(assistantId, `Request failed: ${errorMessage}`, false);
        return;
      }
      const toolEvents = this.extractToolEvents(chunk);
      toolEvents.calls.forEach((call) => this.upsertToolCall(call));
      toolEvents.responses.forEach((response) => this.updateToolResponse(response));

      const content = this.extractAssistantContent(chunk);
      if (content !== null) {
        this.updateAssistant(assistantId, content, true);
      }
    } catch {
      // ignore malformed payloads
    }
  }

  private async throwResponseError(response: Response): Promise<never> {
    const statusText = `Request failed with status ${response.status}`;
    const raw = await response.text();

    try {
      const parsed = JSON.parse(raw) as { error?: unknown; reason?: unknown; message?: unknown };
      const reason =
        typeof parsed.reason === 'string'
          ? parsed.reason
          : typeof parsed.error === 'string'
            ? parsed.error
            : typeof parsed.message === 'string'
              ? parsed.message
              : null;

      throw new Error(reason ?? statusText);
    } catch {
      throw new Error(raw || statusText);
    }
  }

  private extractErrorMessage(chunk: unknown): string | null {
    if (!chunk || typeof chunk !== 'object') {
      return null;
    }

    const reason = (chunk as { reason?: unknown }).reason;
    const error = (chunk as { error?: unknown }).error;

    if (typeof reason === 'string') {
      return reason;
    }
    if (typeof error === 'string') {
      return error;
    }
    return null;
  }

  private assistantContent(id: string) {
    const message = this.messages().find((m) => m.id === id && m.kind === 'chat') as ChatMessage | undefined;
    return message?.content ?? '';
  }

  private extractAssistantContent(chunk: unknown): string | null {
    // OpenAI-style streaming delta support
    const choiceDelta = (chunk as { choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown }; finish_reason?: unknown }> }).choices?.[0];
    if (choiceDelta) {
      const deltaContent = choiceDelta.delta?.content;
      if (typeof deltaContent === 'string') {
        return deltaContent;
      }
      const fullMessageContent = choiceDelta.message?.content;
      if (typeof fullMessageContent === 'string') {
        return fullMessageContent;
      }
    }

    const messages = this.coalesceMessages(chunk as Record<string, unknown>);
    if (!messages.length) {
      return this.extractContent(chunk);
    }

    const assistantCandidates = messages.filter((msg) => !this.isToolResponse(msg));
    if (assistantCandidates.length) {
      const last = assistantCandidates[assistantCandidates.length - 1] as Record<string, unknown>;
      const content = this.extractMessageContent(last);
      if (content !== null) return content;
    }

    return this.extractContent(chunk);
  }

  private extractContent(chunk: unknown): string | null {
    if (!chunk || typeof chunk !== 'object') {
      return null;
    }

    const topLevel = (chunk as { content?: unknown }).content;
    if (typeof topLevel === 'string') {
      return topLevel;
    }

    const fromTopLevel = this.contentFromCandidates(this.coalesceMessages(chunk as Record<string, unknown>));
    if (fromTopLevel !== null) {
      return fromTopLevel;
    }

    const data = (chunk as Record<string, unknown>)['data'] as Record<string, unknown> | undefined;
    if (!data) {
      return null;
    }

    return this.contentFromCandidates(this.coalesceMessages(data));
  }

  private coalesceMessages(data: Record<string, unknown>): unknown[] {
    const messages = (data as Record<string, unknown>)['messages'];
    if (Array.isArray(messages)) {
      return messages;
    }

    const agent = (data as Record<string, unknown>)['agent'];
    const agentMessages =
      agent && typeof agent === 'object'
        ? (agent as Record<string, unknown>)['messages']
        : undefined;
    if (Array.isArray(agentMessages)) {
      return agentMessages;
    }

    const tools = (data as Record<string, unknown>)['tools'];
    const toolMessages =
      tools && typeof tools === 'object'
        ? (tools as Record<string, unknown>)['messages']
        : undefined;
    if (Array.isArray(toolMessages)) {
      return toolMessages;
    }

    return [];
  }

  private contentFromCandidates(candidates: unknown[]): string | null {
    if (!candidates.length) {
      return null;
    }

    const last = candidates[candidates.length - 1] as Record<string, unknown>;
    const content =
      (last as { content?: unknown }).content ??
      (last as { data?: { content?: unknown } }).data?.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const parts = content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }
          if (
            part &&
            typeof part === 'object' &&
            'text' in part &&
            typeof (part as { text?: unknown }).text === 'string'
          ) {
            return (part as { text: string }).text;
          }
          return '';
        })
        .join('');
      return parts || null;
    }

    if (content && typeof content === 'object' && 'text' in (content as Record<string, unknown>)) {
      const text = (content as { text?: unknown }).text;
      return typeof text === 'string' ? text : null;
    }

    return null;
  }

  private extractMessageContent(msg: Record<string, unknown>): string | null {
    const fromDirect = (msg as { content?: unknown }).content;
    if (typeof fromDirect === 'string') return fromDirect;

    const kwargs = (msg as { kwargs?: Record<string, unknown> }).kwargs ?? (msg as Record<string, unknown>)['kwargs'];
    if (kwargs && typeof kwargs === 'object') {
      const kwContent = (kwargs as { content?: unknown }).content;
      if (typeof kwContent === 'string') return kwContent;
    }

    return null;
  }

  private isToolResponse(msg: unknown): boolean {
    if (!msg || typeof msg !== 'object') return false;
    const toolCallId = (msg as { tool_call_id?: unknown }).tool_call_id ?? (msg as { kwargs?: { tool_call_id?: unknown } }).kwargs?.tool_call_id;
    const toolCalls = (msg as { tool_calls?: unknown[] }).tool_calls ?? (msg as { kwargs?: { tool_calls?: unknown[] } }).kwargs?.tool_calls;
    const role = (msg as { type?: unknown }).type;
    return Boolean(toolCallId) || role === 'tool' || (Array.isArray(toolCalls) && !toolCalls.length);
  }

  private extractToolEvents(chunk: unknown): {
    calls: Array<{ id: string; name: string; args: unknown }>;
    responses: Array<{ toolCallId: string; content: string; ok: boolean }>;
  } {
    const messages = this.coalesceMessages(chunk as Record<string, unknown>);
    const calls: Array<{ id: string; name: string; args: unknown }> = [];
    const responses: Array<{ toolCallId: string; content: string; ok: boolean }> = [];

    for (const msg of messages) {
      if (!msg || typeof msg !== 'object') continue;

      const toolCalls =
        (msg as { tool_calls?: unknown[] }).tool_calls ??
        (msg as { kwargs?: { tool_calls?: unknown[] } }).kwargs?.tool_calls ??
        (msg as { additional_kwargs?: { tool_calls?: unknown[] } }).additional_kwargs?.tool_calls;
      if (Array.isArray(toolCalls)) {
        for (const call of toolCalls) {
          if (!call || typeof call !== 'object') continue;
          const name =
            (call as { name?: unknown }).name ??
            (call as { function?: { name?: unknown } }).function?.name ??
            'tool';
          const rawArgs =
            (call as { function?: { arguments?: unknown } }).function?.arguments ??
            (call as { arguments?: unknown }).arguments;
          calls.push({
            id:
              (call as { id?: unknown }).id?.toString() ??
              (call as { function?: { name?: unknown } }).function?.name?.toString() ??
              this.createId(),
            name: typeof name === 'string' ? name : 'tool',
            args: this.parseArgs(rawArgs)
          });
        }
      }

      const toolCallId =
        (msg as { tool_call_id?: unknown }).tool_call_id ??
        (msg as { kwargs?: { tool_call_id?: unknown } }).kwargs?.tool_call_id ??
        (msg as { additional_kwargs?: { tool_call_id?: unknown } }).additional_kwargs?.tool_call_id;
      if (toolCallId) {
        const content =
          this.extractMessageContent(msg as Record<string, unknown>) ??
          this.contentFromCandidates([msg]) ??
          '';
        responses.push({
          toolCallId: String(toolCallId),
          content,
          ok: true
        });
      }
    }

    return { calls, responses };
  }

  private parseArgs(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  private upsertToolCall(call: { id: string; name: string; args: unknown }) {
    this.messages.update((list) => {
      const existingIndex = list.findIndex(
        (item) => item.kind === 'tool' && item.toolCallId === call.id
      );
      const working = [...list];

      if (existingIndex !== -1) {
        const existing = working[existingIndex] as ToolCallMessage;
        working.splice(existingIndex, 1);
        const merged: ToolCallMessage = { ...existing, toolName: call.name, args: call.args };
        const assistantIndex = this.latestAssistantIndex(working);
        if (assistantIndex !== -1) {
          working.splice(assistantIndex, 0, merged);
          return working;
        }
        working.push(merged);
        return working;
      }

      const toolMessage: ToolCallMessage = {
        kind: 'tool',
        id: this.createId(),
        role: 'tool',
        toolCallId: call.id,
        toolName: call.name,
        args: call.args,
        status: 'in-progress',
        collapsed: true,
        createdAt: Date.now()
      };
      const assistantIndex = this.latestAssistantIndex(working);
      if (assistantIndex !== -1) {
        working.splice(assistantIndex, 0, toolMessage);
        return working;
      }
      return [...working, toolMessage];
    });
  }

  private latestAssistantIndex(list: ChatItem[]): number {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const item = list[i];
      if (item.kind === 'chat' && item.role === 'assistant') {
        return i;
      }
    }
    return -1;
  }

  private updateToolResponse(response: { toolCallId: string; content: string; ok: boolean }) {
    this.messages.update((list) =>
      list.map((item) =>
        item.kind === 'tool' && item.toolCallId === response.toolCallId
          ? {
              ...item,
              response: response.content,
              status: response.ok ? 'ended-success' : 'ended-failure',
              collapsed: true
            }
          : item
      )
    );
  }

  private markLatestToolFailure(reason: string) {
    this.messages.update((list) => {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i];
        if (item.kind === 'tool') {
          const combined = `${reason}\n\nTool call payload:\n${this.formatArgs(item.args)}`;
          const updated: ToolCallMessage = {
            ...item,
            response: combined,
            status: 'ended-failure',
            collapsed: false
          };
          return [...list.slice(0, i), updated, ...list.slice(i + 1)];
        }
      }
      return list;
    });
  }

  private updateAssistant(id: string, content: string, streaming: boolean) {
    this.messages.update((list) =>
      list.map((item) =>
        item.kind === 'chat' && item.id === id
          ? {
              ...item,
              content,
              pending: streaming
            }
          : item
      )
    );
  }

  private toOpenAI(history: ChatItem[]) {
    return history
      .filter(
        (message) =>
          message.kind === 'chat' &&
          (message.role === 'user' || message.role === 'assistant' || message.role === 'system')
      )
      .map((message) => ({
        role: (message as ChatMessage).role === 'assistant' ? 'assistant' : (message as ChatMessage).role,
        content: (message as ChatMessage).content
      }));
  }

  private defaultEndpoint() {
    const stored = this.readStored(this.endpointStorageKey);
    if (stored) {
      return stored;
    }
    const base = environment.apiBaseUrl?.trim() || '/api';
    return `${base.replace(/\/$/, '')}/agent`;
  }

  private defaultToken() {
    const stored = this.readStored(this.tokenStorageKey);
    if (stored) {
      return stored;
    }
    return '';
  }

  private persistPreferences(token: string, endpoint: string) {
    this.writeStored(this.tokenStorageKey, token);
    this.writeStored(this.endpointStorageKey, endpoint);
  }

  private readStored(key: string): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    return localStorage.getItem(key);
  }

  private writeStored(key: string, value: string) {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(key, value);
  }

  private createId() {
    return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10);
  }

  protected formatArgs(args: unknown): string {
    if (args === null || args === undefined) return '—';
    if (typeof args === 'string') return args;
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  }

  protected formatToolSignature(name: string, args: unknown): string {
    return `${name}${this.inlineArgs(args)}`;
  }

  protected toggleToolResponse(id: string) {
    this.messages.update((list) =>
      list.map((item) =>
        item.kind === 'tool' && item.id === id ? { ...item, collapsed: !item.collapsed } : item
      )
    );
  }

  private inlineArgs(args: unknown): string {
    if (args === null || args === undefined) return '()';
    if (typeof args === 'string') return `(${this.compactString(args) || '…'})`;
    if (typeof args === 'number' || typeof args === 'boolean') return `(${String(args)})`;

    if (Array.isArray(args)) {
      const preview = args.map((value) => this.inlineValue(value)).join(', ');
      return `(${this.compactString(preview) || '…'})`;
    }

    if (typeof args === 'object') {
      const record = args as Record<string, unknown>;
      const lat = this.pickCoordinate(record, ['lat', 'latitude']);
      const lon = this.pickCoordinate(record, ['lon', 'longitude']);
      if (lat !== null && lon !== null) {
        return `(${lat}, ${lon})`;
      }

      const entries = Object.entries(record);
      if (!entries.length) return '()';

      const preview = entries
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${this.inlineValue(value)}`)
        .join(', ');
      const suffix = entries.length > 3 ? ' …' : '';

      return `(${this.compactString(preview + suffix) || '…'})`;
    }

    return `(${this.compactString(String(args)) || '…'})`;
  }

  private inlineValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return this.compactString(value, 30) || '…';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      const rendered = value.slice(0, 2).map((entry) => this.inlineValue(entry)).join(', ');
      return `[${rendered}${value.length > 2 ? ', …' : ''}]`;
    }
    if (typeof value === 'object') return '{…}';
    return this.compactString(String(value), 30) || '…';
  }

  private pickCoordinate(record: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number') {
        return Number(value);
      }
    }
    return null;
  }

  private compactString(value: string, max = 80): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    if (!singleLine) return '';
    return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
  }

  protected roleLabel(role: ChatMessage['role']): string {
    if (role === 'assistant') return 'Bernard';
    if (role === 'user') return 'You';
    if (role === 'system') return 'System';
    return role;
  }

  protected isLastChatRole(index: number): boolean {
    const list = this.messages();
    if (index < 0 || index >= list.length) return false;

    const current = list[index];
    if (current.kind !== 'chat') return false;

    for (let i = list.length - 1; i >= 0; i -= 1) {
      const item = list[i];
      if (item.kind === 'chat' && item.role === current.role) {
        return i === index;
      }
    }
    return false;
  }
}

