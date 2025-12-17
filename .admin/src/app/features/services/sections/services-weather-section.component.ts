import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';

@Component({
  selector: 'app-services-weather-section',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputTextModule, DropdownModule],
  template: `
    <div [formGroup]="group" class="grid two-col">
      <label class="field">
        <span class="label">API key</span>
        <input pInputText type="password" formControlName="apiKey" placeholder="openweather-api-key" />
      </label>
      <label class="field">
        <span class="label">Current API URL</span>
        <input pInputText formControlName="apiUrl" placeholder="https://api.openweathermap.org/data/2.5/weather" />
      </label>
      <label class="field">
        <span class="label">Forecast URL</span>
        <input pInputText formControlName="forecastUrl" placeholder="https://api.open-meteo.com/v1/forecast" />
      </label>
      <label class="field">
        <span class="label">Historical URL</span>
        <input pInputText formControlName="historicalUrl" placeholder="https://archive-api.open-meteo.com/v1/archive" />
      </label>
      <label class="field">
        <span class="label">Units</span>
        <p-dropdown formControlName="units" [options]="units" optionLabel="label" optionValue="value" placeholder="Auto"></p-dropdown>
      </label>
      <label class="field">
        <span class="label">Timeout (ms)</span>
        <input pInputText type="number" formControlName="timeoutMs" placeholder="12000" />
      </label>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesWeatherSectionComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input({ required: true }) units!: { label: string; value: string }[];
}

