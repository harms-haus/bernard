import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-services-geocoding-section',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputTextModule],
  template: `
    <div [formGroup]="group" class="grid two-col">
      <label class="field">
        <span class="label">API URL</span>
        <input pInputText formControlName="url" placeholder="https://nominatim.openstreetmap.org/search" />
      </label>
      <label class="field">
        <span class="label">User agent</span>
        <input pInputText formControlName="userAgent" placeholder="bernard-admin (+https://example.com)" />
      </label>
      <label class="field">
        <span class="label">Contact email (optional)</span>
        <input pInputText formControlName="email" placeholder="ops@example.com" />
      </label>
      <label class="field">
        <span class="label">Referer (optional)</span>
        <input pInputText formControlName="referer" placeholder="https://example.com" />
      </label>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesGeocodingSectionComponent {
  @Input({ required: true }) group!: FormGroup;
}

