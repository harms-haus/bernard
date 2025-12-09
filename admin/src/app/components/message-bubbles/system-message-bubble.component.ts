import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MessageBubbleShellComponent } from './message-bubble-shell.component';

@Component({
  selector: 'app-system-message-bubble',
  imports: [CommonModule, MessageBubbleShellComponent],
  template: `
    <app-message-bubble-shell role="system" align="start" [footer]="footer()">
      <pre class="content muted">{{ text() }}</pre>
    </app-message-bubble-shell>
  `,
  styleUrl: './text-message-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SystemMessageBubbleComponent {
  readonly text = input<string>('');
  readonly footer = input<string | null>(null);
}

