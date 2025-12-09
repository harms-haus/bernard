import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type BubbleRole = 'user' | 'assistant' | 'system' | 'tool';
type BubbleAlign = 'start' | 'end';

@Component({
  selector: 'app-message-bubble-shell',
  imports: [CommonModule],
  template: `
    <div class="message" [class.outgoing]="isOutgoing()">
      <div class="bubble" [attr.data-role]="role()">
        <ng-content />
      </div>
      @if (footer()) {
        <div class="role-footer" [class.outgoing]="isOutgoing()">
          {{ footer() }}
        </div>
      }
    </div>
  `,
  styleUrl: './message-bubble-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageBubbleShellComponent {
  readonly role = input<BubbleRole>('assistant');
  readonly align = input<BubbleAlign>('start');
  readonly footer = input<string | null>(null);

  protected readonly isOutgoing = computed(() => this.align() === 'end');
}

