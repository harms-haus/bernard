import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { MessageBubbleComponent } from './message-bubble.component';

@Component({
  selector: 'app-system-message-bubble',
  imports: [CommonModule, MessageBubbleComponent],
  template: `
    <app-message-bubble role="system" align="start" [footer]="footer()">
      <p class="content muted" message-bubble-content>{{ displayText() }}</p>
    </app-message-bubble>
  `,
  styleUrl: './text-message-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SystemMessageBubbleComponent {
  readonly text = input<string>('');
  readonly footer = input<string | null>(null);

  protected readonly displayText = computed(() => this.text());
}

