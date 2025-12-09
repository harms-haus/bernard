import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  contentChild,
  input,
  signal
} from '@angular/core';

type BubbleRole = 'user' | 'assistant' | 'system' | 'tool';
type BubbleAlign = 'start' | 'end';

@Component({
  selector: 'app-message-bubble',
  imports: [CommonModule],
  template: `
    <div class="message" [class.outgoing]="isOutgoing()">
      @if (hasHeader()) {
        <div class="message-bubble-header" [class.outgoing]="isOutgoing()">
          <ng-content select="[message-bubble-header]" />
        </div>
      }

      <div
        class="bubble"
        [class.outgoing]="isOutgoing()"
        [class.expandable]="effectiveExpandable()"
        [class.expanded]="isExpanded()"
        [attr.data-role]="role()"
        [attr.tabindex]="effectiveExpandable() ? 0 : null"
        [attr.role]="effectiveExpandable() ? 'button' : null"
        [attr.aria-expanded]="effectiveExpandable() ? isExpanded() : null"
        (click)="toggleExpanded()"
        (keydown)="onKeydown($event)"
      >
        <div class="bubble-main" [class.reverse]="isOutgoing()">
          <div class="message-bubble-content">
            <ng-content select="[message-bubble-content]" />
          </div>
          @if (effectiveExpandable()) {
            <span class="chevron" aria-hidden="true">{{ isExpanded() ? '▴' : '▾' }}</span>
          }
        </div>

        @if (isExpanded() && hasExpandingContent()) {
          <div class="message-bubble-expanding-content">
            <ng-content select="[message-bubble-expanding-content]" />
          </div>
        }
      </div>

      @if (hasFooter()) {
        <div class="message-bubble-footer" [class.outgoing]="isOutgoing()">
          <ng-content select="[message-bubble-footer]" />
          @if (footer()) {
            <span class="footer-text">{{ footer() }}</span>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './message-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageBubbleComponent {
  readonly role = input<BubbleRole>('assistant');
  readonly align = input<BubbleAlign>('start');
  readonly footer = input<string | null>(null);
  readonly expandable = input<boolean>(true);
  readonly hasExpandableHint = input<boolean>(false);

  private readonly expanded = signal(false);

  private readonly headerSlot = contentChild<ElementRef<HTMLElement>>(
    '[message-bubble-header]',
    { descendants: true }
  );
  private readonly footerSlot = contentChild<ElementRef<HTMLElement>>(
    '[message-bubble-footer]',
    { descendants: true }
  );
  private readonly contentSlot = contentChild<ElementRef<HTMLElement>>(
    '[message-bubble-content]',
    { descendants: true }
  );
  private readonly expandingSlot = contentChild<ElementRef<HTMLElement>>(
    '[message-bubble-expanding-content]',
    { descendants: true }
  );

  protected readonly isOutgoing = computed(() => this.align() === 'end');
  protected readonly isExpanded = computed(() => this.expanded());

  protected readonly hasHeader = computed(() => {
    const el = this.headerSlot()?.nativeElement;
    return Boolean(el && el.textContent && el.textContent.trim());
  });

  protected readonly hasFooter = computed(() => {
    const slotEl = this.footerSlot()?.nativeElement;
    const slotHasText = Boolean(slotEl && slotEl.textContent && slotEl.textContent.trim());
    return slotHasText || Boolean(this.footer());
  });

  protected readonly hasContent = computed(() => Boolean(this.contentSlot()));

  protected readonly hasExpandingContent = computed(() => {
    const el = this.expandingSlot()?.nativeElement;
    const slotHasContent = Boolean(el && el.textContent && el.textContent.trim());
    return slotHasContent || this.hasExpandableHint();
  });
  protected readonly effectiveExpandable = computed(() => this.expandable() && this.hasExpandingContent());

  toggleExpanded() {
    if (!this.effectiveExpandable()) return;
    this.expanded.update((current) => !current);
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.effectiveExpandable()) return;
    const key = event.key;
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      this.toggleExpanded();
    }
  }
}

