import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';

import { environment } from '../../config/environment';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  pending?: boolean;
  createdAt: number;
};

@Component({
  selector: 'app-chat',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputTextareaModule,
    TagModule,
    MessageModule
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponent {
  private readonly fb = inject(FormBuilder);
  private readonly tokenStorageKey = 'bernard:chatToken';
  private readonly endpointStorageKey = 'bernard:chatEndpoint';

  protected readonly messages = signal<ChatMessage[]>([]);
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
      id: this.createId(),
      role: 'user',
      content: text,
      createdAt: Date.now()
    };
    const assistantId = this.createId();

    const history = [...this.messages(), userMessage];
    this.messages.set([
      ...history,
      { id: assistantId, role: 'assistant', content: '', createdAt: Date.now(), pending: true }
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
    history: ChatMessage[];
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
        this.updateAssistant(assistantId, `Request failed: ${errorMessage}`, false);
        return;
      }
      const content = this.extractContent(chunk);
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
    const message = this.messages().find((m) => m.id === id);
    return message?.content ?? '';
  }

  private extractContent(chunk: unknown): string | null {
    if (!chunk || typeof chunk !== 'object') {
      return null;
    }

    const topLevel = (chunk as { content?: unknown }).content;
    if (typeof topLevel === 'string') {
      return topLevel;
    }

    const data = (chunk as Record<string, unknown>)['data'] as Record<string, unknown> | undefined;
    if (!data) {
      return null;
    }

    const candidates = this.coalesceMessages(data);
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

  private updateAssistant(id: string, content: string, streaming: boolean) {
    this.messages.update((list) =>
      list.map((item) =>
        item.id === id
          ? {
              ...item,
              content,
              pending: streaming
            }
          : item
      )
    );
  }

  private toOpenAI(history: ChatMessage[]) {
    return history
      .filter(
        (message) =>
          message.role === 'user' || message.role === 'assistant' || message.role === 'system'
      )
      .map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : message.role,
        content: message.content
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
    return environment.adminToken ?? '';
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
}

