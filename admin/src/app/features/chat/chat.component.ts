import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PrimeNGConfig } from 'primeng/api';

import { environment } from '../../config/environment';
import 'deep-chat';

type DeepChatRequestBody = {
  messages?: Array<{ text?: unknown; role?: unknown }>;
};

type DeepChatResponse = { text?: string; role?: string; error?: string };

type DeepChatSignals = {
  onOpen?: () => void;
  onClose?: () => void;
  onResponse?: (response: DeepChatResponse) => void;
  stopClicked?: { listener?: () => void };
};

type DeepChatElement = HTMLElement & { clearMessages?: (isReset?: boolean) => void };

const MODEL_ID = 'bernard-v1';

@Component({
  selector: 'app-chat',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, MessageModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'chat-host' }
})
export class ChatComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly primeng = inject(PrimeNGConfig);
  private readonly tokenStorageKey = 'bernard:chatToken';
  private readonly endpointStorageKey = 'bernard:chatEndpoint';

  private streamAbort: AbortController | null = null;

  @ViewChild('deepChat', { static: false }) private deepChat?: ElementRef<DeepChatElement>;

  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    endpoint: [this.defaultEndpoint(), Validators.required],
    token: [this.defaultToken(), Validators.required]
  });

  protected readonly endpointLabel = computed(() => (this.form.controls.endpoint.value ?? '').trim());
  protected readonly connectConfig = computed(() => ({
    stream: true,
    handler: this.handleStream
  }));

  protected readonly messageStyles = {
    default: {
      shared: {
        bubble: {
          border: '1px solid var(--surface-border)',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)'
        }
      },
      ai: {
        bubble: {
          backgroundColor: 'var(--primary-700, #1d4ed8)',
          color: 'var(--surface-0, #ffffff)'
        }
      },
      user: {
        bubble: {
          backgroundColor: 'var(--surface-card, #ffffff)',
          color: 'var(--text-color, #111827)'
        }
      }
    }
  };

  protected readonly textInputConfig = {
    placeholder: { text: 'Ask Bernard to check status, set a timer, or search the web…' },
    styles: {
      text: {
        color: 'var(--text-color, #111827)'
      },
      placeholder: {
        color: 'var(--text-secondary, #6b7280)'
      },
      container: {
        backgroundColor: 'var(--surface-card, #ffffff)',
        border: '1px solid var(--surface-border)',
        minHeight: '60px',
        padding: '0.75rem 1rem'
      }
    }
  };

  protected readonly errorMessages = {
    displayServiceErrorMessages: true
  };

  protected readonly chatStyle = {
    backgroundColor: 'var(--surface-panel)',
    border: '1px solid var(--surface-border)',
    borderRadius: '12px',
    padding: '0.75rem'
  };

  protected readonly submitButtonStyles = {
    submit: {
      container: {
        default: {
          backgroundColor: 'var(--primary-color)',
          borderRadius: '10px'
        },
        hover: { backgroundColor: 'var(--primary-600, var(--primary-color))' }
      },
      svg: {
        styles: {
          default: {
            filter:
              'brightness(0) saturate(100%) invert(100%) sepia(0%) saturate(0%) hue-rotate(182deg) brightness(106%) contrast(104%)'
          }
        }
      }
    }
  };

  constructor() {
    this.primeng.ripple = true;

    effect(() => {
      const value = this.form.controls.token.value?.trim() ?? '';
      this.writeStored(this.tokenStorageKey, value);
    });

    effect(() => {
      const value = this.form.controls.endpoint.value?.trim() ?? '';
      this.writeStored(this.endpointStorageKey, value);
    });
  }

  ngOnDestroy() {
    this.streamAbort?.abort();
  }

  protected resetConversation() {
    this.error.set(null);
    this.streamAbort?.abort();
    this.deepChat?.nativeElement?.clearMessages?.(true);
  }

  private handleStream = async (body: unknown, signals: DeepChatSignals) => {
    const endpoint = (this.form.controls.endpoint.value ?? '').trim();
    const token = (this.form.controls.token.value ?? '').trim();

    if (!endpoint) {
      const message = 'Set an API endpoint before chatting.';
      this.error.set(message);
      signals.onResponse?.({ error: message });
      signals.onClose?.();
      return;
    }
    if (!token) {
      const message = 'Add a bearer token to chat with Bernard.';
      this.error.set(message);
      signals.onResponse?.({ error: message });
      signals.onClose?.();
      return;
    }

    this.error.set(null);

    const controller = new AbortController();
    this.streamAbort?.abort();
    this.streamAbort = controller;

    if (!signals.stopClicked) {
      signals.stopClicked = { listener: undefined };
    }
    if (signals.stopClicked) {
      signals.stopClicked.listener = () => controller.abort();
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(this.buildRequestBody(body)),
        signal: controller.signal
      });

      if (!response.ok) {
        const message = await this.responseErrorText(response);
        this.error.set(message);
        signals.onResponse?.({ error: message });
        signals.onClose?.();
        return;
      }

      if (!response.body) {
        const message = 'Missing response body from Bernard.';
        this.error.set(message);
        signals.onResponse?.({ error: message });
        signals.onClose?.();
        return;
      }

      signals.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          this.consumeSseEvent(raw, signals);
          boundary = buffer.indexOf('\n\n');
        }
      }

      signals.onClose?.();
    } catch (err) {
      if (controller.signal.aborted) {
        signals.onClose?.();
        return;
      }
      const message = this.errorText(err);
      this.error.set(message);
      signals.onResponse?.({ error: message });
      signals.onClose?.();
    }
  };

  private buildRequestBody(body: unknown) {
    const parsed = (body as DeepChatRequestBody) ?? {};
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];

    return {
      model: MODEL_ID,
      stream: true,
      messages: messages.map((message) => ({
        role: this.mapRole(message.role),
        content: typeof message.text === 'string' ? message.text : ''
      })),
      clientMeta: { source: 'admin-chat' }
    };
  }

  private mapRole(role: unknown): 'user' | 'assistant' | 'system' {
    if (role === 'ai' || role === 'assistant') return 'assistant';
    if (role === 'system') return 'system';
    return 'user';
  }

  private consumeSseEvent(raw: string, signals: DeepChatSignals) {
    const lines = raw.split('\n').filter((line) => line.startsWith('data:'));
    const payload = lines.map((line) => line.replace(/^data:\s*/, '')).join('');

    if (!payload) {
      return;
    }

    if (payload === '[DONE]') {
      signals.onClose?.();
      return;
    }

    try {
      const chunk = JSON.parse(payload) as {
        error?: unknown;
        reason?: unknown;
        choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }>;
      };

      const errorMessage = this.extractError(chunk);
      if (errorMessage) {
        this.error.set(errorMessage);
        signals.onResponse?.({ error: errorMessage });
        return;
      }

      const text = this.extractText(chunk);
      if (text) {
        signals.onResponse?.({ text, role: 'ai' });
      }
    } catch {
      // ignore malformed payloads
    }
  }

  private extractText(chunk: {
    choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }>;
  }): string | null {
    const choice = chunk.choices?.[0];
    if (!choice) return null;

    const deltaContent = choice.delta?.content;
    if (typeof deltaContent === 'string') return deltaContent;

    const messageContent = choice.message?.content;
    if (typeof messageContent === 'string') return messageContent;

    return null;
  }

  private extractError(chunk: { error?: unknown; reason?: unknown }): string | null {
    if (typeof chunk.error === 'string') return chunk.error;
    if (typeof chunk.reason === 'string') return chunk.reason;
    return null;
  }

  private errorText(err: unknown) {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'Something went wrong while chatting with Bernard.';
  }

  private async responseErrorText(response: Response) {
    const fallback = `Request failed with status ${response.status}`;
    try {
      const raw = await response.text();
      const parsed = JSON.parse(raw) as { error?: unknown; reason?: unknown; message?: unknown };
      if (typeof parsed.error === 'string') return parsed.error;
      if (typeof parsed.reason === 'string') return parsed.reason;
      if (typeof parsed.message === 'string') return parsed.message;
      return raw || fallback;
    } catch {
      return fallback;
    }
  }

  private defaultEndpoint() {
    const base = environment.apiBaseUrl?.trim() || '/api';
    const normalizedBase = base.replace(/\/$/, '');
    const stored = this.readStored(this.endpointStorageKey);
    return stored?.trim() || `${normalizedBase}/v1/chat/completions`;
  }

  private defaultToken() {
    return this.readStored(this.tokenStorageKey) ?? '';
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
    if (!value) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  }
}

