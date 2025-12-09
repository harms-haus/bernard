import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MessageBubbleShellComponent } from './message-bubble-shell.component';

@Component({
  selector: 'app-assistant-message-bubble',
  imports: [CommonModule, MessageBubbleShellComponent],
  template: `
    <app-message-bubble-shell role="assistant" align="start" [footer]="footer()">
      <pre class="content">{{ text() }}</pre>
    </app-message-bubble-shell>
  `,
  styleUrl: './text-message-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssistantMessageBubbleComponent {
  readonly text = input<string>('');
  readonly footer = input<string | null>(null);
}

