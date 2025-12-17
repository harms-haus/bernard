import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-services-search-section',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputTextModule],
  template: `
    <div [formGroup]="group" class="grid two-col">
      <label class="field">
        <span class="label">API key</span>
        <input pInputText type="password" formControlName="apiKey" placeholder="brv-****" />
      </label>
      <label class="field">
        <span class="label">API URL</span>
        <input pInputText formControlName="apiUrl" placeholder="https://api.search.brave.com/res/v1/web/search" />
      </label>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesSearchSectionComponent {
  @Input({ required: true }) group!: FormGroup;
}

