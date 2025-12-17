import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PrimeNGConfig } from 'primeng/api';

import { environment } from '../../config/environment';
import 'deep-chat';

type DeepChatRequestBody = {
  messages?: Array<{ text?: unknown; role?: unknown }>;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly tokenStorageKey = 'bernard:chatToken';
  private readonly endpointStorageKey = 'bernard:chatEndpoint';

  private streamAbort: AbortController | null = null;

  @ViewChild('deepChat', { static: false }) private deepChat?: ElementRef<DeepChatElement>;

  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    endpoint: [this.defaultEndpoint(), Validators.required],
    token: [this.defaultToken()]
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

    const initialToken = this.form.controls.token.value?.trim() ?? '';
    const initialEndpoint = this.form.controls.endpoint.value?.trim() ?? '';
    this.writeStored(this.tokenStorageKey, initialToken);
    this.writeStored(this.endpointStorageKey, initialEndpoint);

    this.form.controls.token.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.writeStored(this.tokenStorageKey, value?.trim() ?? ''));

    this.form.controls.endpoint.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.writeStored(this.endpointStorageKey, value?.trim() ?? ''));
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(this.buildRequestBody(body)),
        signal: controller.signal,
        credentials: 'include'
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
    const stream = parsed.stream ?? true;
    const streamOptions = parsed.stream_options;

    return {
      model: MODEL_ID,
      stream,
      ...(streamOptions ? { stream_options: streamOptions } : {}),
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
        choices?: Array<{
          delta?: {
            content?: unknown;
            tool_calls?: unknown;
            tool_outputs?: unknown;
          };
          message?: { content?: unknown };
        }>;
      };

      const errorMessage = this.extractError(chunk);
      if (errorMessage) {
        this.error.set(errorMessage);
        signals.onResponse?.({ error: errorMessage });
        return;
      }

      const choice = chunk.choices?.[0];
      if (!choice) return;

      // Handle tool calls
      const toolCalls = choice.delta?.tool_calls;
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        // For now, we'll just ignore tool calls in the chat UI
        // In a more complete implementation, you might want to display them
        return;
      }

      // Handle tool outputs
      const toolOutputs = choice.delta?.tool_outputs;
      if (Array.isArray(toolOutputs) && toolOutputs.length > 0) {
        // For now, we'll just ignore tool outputs in the chat UI
        // In a more complete implementation, you might want to display them
        return;
      }

      // Extract and filter text content
      const text = this.extractText(chunk);
      if (text) {
        // Filter out LLM event messages that shouldn't be shown to users
        if (text.startsWith('LLM Call Start:') || text.startsWith('LLM Call Complete:')) {
          return;
        }
        
        // Only send actual content to be displayed
        signals.onResponse?.({ text, role: 'ai' });
      }
    } catch {
      // ignore malformed payloads
    }
  }
  private extractText(chunk: {
