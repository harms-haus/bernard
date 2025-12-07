import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { ServiceConfig } from '../../data/models';

@Component({
  selector: 'app-services',
  imports: [CommonModule, ReactiveFormsModule, CardModule, ButtonModule, InputTextModule],
  templateUrl: './services.component.html',
  styleUrl: './services.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal<boolean>(true);
  protected readonly savingId = signal<string | null>(null);
  protected readonly services = signal<ServiceConfig[]>([]);
  protected readonly forms = signal<Record<string, ReturnType<ServicesComponent['buildForm']>>>({});
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load() {
    this.loading.set(true);
    this.api
      .listServices()
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (value) => {
          this.services.set(value);
          this.forms.set(this.buildForms(value));
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load services')
      });
  }

  protected optionKeys(service: ServiceConfig) {
    return Object.keys(service.options ?? {});
  }

  protected formFor(service: ServiceConfig) {
    return this.forms()[service.id];
  }

  protected save(service: ServiceConfig) {
    const form = this.forms()[service.id];
    if (!form) {
      return;
    }
    this.savingId.set(service.id);
    const options = this.optionKeys(service).reduce<Record<string, string | number | boolean>>((acc, key) => {
      const control = form.get(key);
      if (control) {
        acc[key] = control.value as string;
      }
      return acc;
    }, {});

    const apiKey = form.get('apiKey')?.value as string | undefined;

    this.api
      .updateService(service.id, { apiKey, options })
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.savingId.set(null))
      )
      .subscribe({
        next: (updated) => {
          const nextServices = this.services().map((svc) => (svc.id === updated.id ? updated : svc));
          this.services.set(nextServices);
          this.forms.set(this.buildForms(nextServices));
        },
        error: () => this.error.set('Unable to save service')
      });
  }

  private buildForms(services: ServiceConfig[]) {
    const forms: Record<string, ReturnType<ServicesComponent['buildForm']>> = {};
    services.forEach((service) => {
      forms[service.id] = this.buildForm(service);
    });
    return forms;
  }

  private buildForm(service: ServiceConfig) {
    const controls: Record<string, unknown> = {
      apiKey: this.fb.control(service.apiKey ?? '')
    };
    Object.entries(service.options ?? {}).forEach(([key, value]) => {
      controls[key] = this.fb.control(String(value));
    });
    return this.fb.group(controls);
  }
}
