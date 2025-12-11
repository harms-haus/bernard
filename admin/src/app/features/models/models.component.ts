import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { MessageModule } from 'primeng/message';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { ModelCallOptions, ModelCategorySettings, ModelsSettings } from '../../data/models';

type ModelKey = keyof ModelsSettings;

type ModelCategoryMeta = { key: ModelKey; label: string; description: string };

@Component({
  selector: 'app-models',
  imports: [CommonModule, ReactiveFormsModule, CardModule, ButtonModule, InputTextModule, AutoCompleteModule, MessageModule],
  templateUrl: './models.component.html',
  styleUrl: './models.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelsComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal<boolean>(true);
  protected readonly saving = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly modelOptions = signal<string[]>([]);
  protected readonly filteredOptions = signal<string[]>([]);

  protected readonly categories: ModelCategoryMeta[] = [
    { key: 'response', label: 'Response', description: 'Final answer model used to reply.' },
    { key: 'intent', label: 'Intent', description: 'Routing and tool selection model.' },
    { key: 'memory', label: 'Memory', description: 'Utility model used for memory dedupe and search.' },
    { key: 'utility', label: 'Utility', description: 'Helper model for tools and misc tasks.' },
    { key: 'aggregation', label: 'Aggregation', description: 'Summaries and rollups.' }
  ];

  protected readonly form = this.fb.group({
    response: this.buildCategoryForm(),
    intent: this.buildCategoryForm(),
    memory: this.buildCategoryForm(),
    utility: this.buildCategoryForm(),
    aggregation: this.buildCategoryForm()
  });

  constructor() {
    this.load();
  }

  protected load() {
    this.loading.set(true);
    this.api
      .getModelsSettings()
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (settings) => {
          this.patchForms(settings);
          this.updateModelOptions(settings);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load model settings')
      });
  }

  protected filter(event: { query?: string }) {
    const query = (event.query ?? '').toLowerCase();
    const suggestions = this.modelOptions().filter((opt) => opt.toLowerCase().includes(query));
    this.filteredOptions.set(suggestions);
  }

  protected save() {
    if (this.saving()) return;
    const payload = this.collectPayload();
    this.saving.set(true);
    this.api
      .updateModelsSettings(payload)
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.saving.set(false))
      )
      .subscribe({
        next: (settings) => {
          this.patchForms(settings);
          this.updateModelOptions(settings);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to save model settings')
      });
  }

  private buildCategoryForm(initial?: ModelCategorySettings) {
    return this.fb.group({
      primary: [initial?.primary ?? ''],
      fallbacks: [initial?.fallbacks ?? []],
      temperature: [initial?.options?.temperature ?? null],
      topP: [initial?.options?.topP ?? null],
      maxTokens: [initial?.options?.maxTokens ?? null],
      baseUrl: [initial?.options?.baseUrl ?? ''],
      apiKey: [initial?.options?.apiKey ?? '']
    });
  }

  private patchForms(settings: ModelsSettings) {
    this.categories.forEach((category) => {
      const group = this.form.get(category.key);
      const values = settings[category.key] ?? { primary: '', fallbacks: [] };
      group?.patchValue({
        primary: values.primary ?? '',
        fallbacks: values.fallbacks ?? [],
        temperature: values.options?.temperature ?? null,
        topP: values.options?.topP ?? null,
        maxTokens: values.options?.maxTokens ?? null,
        baseUrl: values.options?.baseUrl ?? '',
        apiKey: values.options?.apiKey ?? ''
      });
    });
  }

  private updateModelOptions(settings: ModelsSettings) {
    const options = new Set<string>();
    this.categories.forEach((category) => {
      const config = settings[category.key];
      if (config?.primary) options.add(config.primary);
      config?.fallbacks?.forEach((m) => options.add(m));
    });
    this.modelOptions.set([...options]);
  }

  private collectPayload(): ModelsSettings {
    const assembleCategory = (key: ModelKey): ModelCategorySettings => {
      const group = this.form.get(key);
      const primary = (group?.get('primary')?.value as string) ?? '';
      const fallbacks = ((group?.get('fallbacks')?.value as string[]) ?? []).map((m) => m.trim()).filter(Boolean);
      const options: ModelCallOptions = {
        temperature: this.numberOrUndefined(group?.get('temperature')?.value),
        topP: this.numberOrUndefined(group?.get('topP')?.value),
        maxTokens: this.numberOrUndefined(group?.get('maxTokens')?.value),
        baseUrl: this.stringOrUndefined(group?.get('baseUrl')?.value),
        apiKey: this.stringOrUndefined(group?.get('apiKey')?.value)
      };
      const normalizedOptions = Object.fromEntries(
        Object.entries(options).filter(([, value]) => value !== undefined)
      ) as ModelCallOptions | undefined;
      return {
        primary: primary.trim(),
        fallbacks,
        ...(normalizedOptions && Object.keys(normalizedOptions).length ? { options: normalizedOptions } : {})
      };
    };

    return {
      response: assembleCategory('response'),
      intent: assembleCategory('intent'),
      memory: assembleCategory('memory'),
      utility: assembleCategory('utility'),
      aggregation: assembleCategory('aggregation')
    };
  }

  private numberOrUndefined(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private stringOrUndefined(value: unknown): string | undefined {
    const str = typeof value === 'string' ? value.trim() : '';
    return str ? str : undefined;
  }
}

