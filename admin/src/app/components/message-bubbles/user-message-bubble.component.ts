import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MessageBubbleShellComponent } from './message-bubble-shell.component';

@Component({
  selector: 'app-user-message-bubble',
  imports: [CommonModule, MessageBubbleShellComponent],
  template: `
    <app-message-bubble-shell role="user" align="end" [footer]="footer()">
      <pre class="content">{{ text() }}</pre>
    </app-message-bubble-shell>
  `,
  styleUrl: './text-message-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserMessageBubbleComponent {
  readonly text = input<string>('');
  readonly footer = input<string | null>(null);
}

