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
import { DropdownModule } from 'primeng/dropdown';
import { DialogModule } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';

import { API_CLIENT, ApiClient, ProviderType } from '../../data/api.service';
import { ModelCallOptions, ModelCategorySettings, ModelsSettings, ModelInfo } from '../../data/models';

type ModelKey = keyof Omit<ModelsSettings, 'providers'>;

type ModelCategoryMeta = { key: ModelKey; label: string; description: string };

interface ProviderOption {
  label: string;
  value: string;
}

interface ModelOption {
  label: string;
  value: string;
}

interface ModelOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-models',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    AutoCompleteModule,
    DropdownModule,
    MessageModule,
    DialogModule
  ],
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

  protected readonly providers = signal<ProviderType[]>([]);
  protected readonly providerOptions = signal<ProviderOption[]>([]);
  protected readonly modelOptions = signal<ModelOption[]>([]);
  protected readonly modelSuggestions = signal<ModelOption[]>([]);

  protected readonly testingProvider = signal<string | null>(null);
  protected readonly testingError = signal<string | null>(null);

  protected readonly showAddProviderDialog = signal<boolean>(false);
  protected readonly showEditProviderDialog = signal<boolean>(false);
  protected readonly editingProvider = signal<ProviderType | null>(null);

  protected readonly providerForm = this.fb.group({
    name: [''],
    baseUrl: [''],
    apiKey: ['']
  });

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
          this.updateProviderOptions(settings);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load model settings')
      });

    // Load providers separately
    this.api
      .listProviders()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (providers) => {
          this.providers.set(providers);
          this.updateProviderOptions({ 
            providers, 
            response: { primary: '', providerId: '', options: {} },
            intent: { primary: '', providerId: '', options: {} },
            memory: { primary: '', providerId: '', options: {} },
            utility: { primary: '', providerId: '', options: {} },
            aggregation: { primary: '', providerId: '', options: {} }
          });
        },
        error: () => this.error.set('Unable to load providers')
      });
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
          this.updateProviderOptions(settings);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to save model settings')
      });
  }

  protected addProvider() {
    this.providerForm.reset();
    this.showAddProviderDialog.set(true);
  }

  protected editProvider(provider: ProviderType) {
    this.editingProvider.set(provider);
    this.providerForm.patchValue({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey
    });
    this.showEditProviderDialog.set(true);
  }

  protected deleteProvider(provider: ProviderType) {
    if (!confirm(`Delete provider "${provider.name}"? This will also remove it from any model configurations.`)) {
      return;
    }

    this.api
      .deleteProvider(provider.id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          this.load();
        },
        error: () => this.error.set('Unable to delete provider')
      });
  }

  protected testProvider(provider: ProviderType) {
    this.testingProvider.set(provider.id);
    this.testingError.set(null);

    this.api
      .testProvider(provider.id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (result) => {
          this.testingProvider.set(null);
          if (result.status === 'failed') {
            this.testingError.set(result.error || 'Provider test failed');
          }
          this.load();
        },
        error: () => {
          this.testingProvider.set(null);
          this.testingError.set('Provider test failed');
        }
      });
  }

  protected saveProvider() {
    const isEdit = !!this.editingProvider();
    const body = this.providerForm.value;

    if (!body.name || !body.baseUrl || !body.apiKey) {
      this.error.set('Please fill in all provider fields');
      return;
    }

    // Clean up the form values to remove null values
    const cleanBody = {
      name: body.name,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey
    };

    const request = isEdit
      ? this.api.updateProvider(this.editingProvider()!.id, cleanBody)
      : this.api.createProvider(cleanBody);

    request.pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          this.showAddProviderDialog.set(false);
          this.showEditProviderDialog.set(false);
          this.load();
        },
        error: (err) => {
          this.error.set(err.error?.error || 'Unable to save provider');
        }
      });
  }

  protected getModelSuggestions(category: ModelKey): ModelOption[] {
    const categoryId = this.form.get(category)?.get('providerId')?.value;
    if (!categoryId) return [];

    const provider = this.providers().find(p => p.id === categoryId);
    if (!provider) return [];

    // Check if provider is working
    if (provider.testStatus === 'failed') {
      return [];
    }

    return this.modelOptions();
  }

  protected fetchModelsForProvider(event: { query?: string }, providerId: string) {
    if (!providerId) return;

    const query = (event.query ?? '').toLowerCase();
    this.api
      .getProviderModels(providerId)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (models) => {
          const options = models.map(model => ({
            label: model.id,
            value: model.id
          }));
          this.modelOptions.set(options);
          const suggestions = options.filter(opt => opt.label.toLowerCase().includes(query));
          this.modelSuggestions.set(suggestions);
        },
        error: () => {
          this.error.set('Unable to fetch models from provider');
        }
      });
  }

  protected isProviderWorking(providerId: string): boolean {
    const provider = this.providers().find(p => p.id === providerId);
    return provider?.testStatus === 'working';
  }

  protected isProviderInUse(providerId: string): boolean {
    const categories: ModelKey[] = ['response', 'intent', 'memory', 'utility', 'aggregation'];
    return categories.some(category => {
      const formCategory = this.form.get(category);
      return formCategory?.get('providerId')?.value === providerId;
    });
  }

  private buildCategoryForm(initial?: ModelCategorySettings) {
    return this.fb.group({
      primary: [initial?.primary ?? ''],
      providerId: [initial?.providerId ?? ''],
      temperature: [initial?.options?.temperature ?? null],
      topP: [initial?.options?.topP ?? null],
      maxTokens: [initial?.options?.maxTokens ?? null]
    });
  }

  private patchForms(settings: ModelsSettings) {
    this.categories.forEach((category) => {
      const group = this.form.get(category.key);
      const values = settings[category.key] ?? { primary: '', providerId: '' };
      group?.patchValue({
        primary: values.primary ?? '',
        providerId: values.providerId ?? '',
        temperature: values.options?.temperature ?? null,
        topP: values.options?.topP ?? null,
        maxTokens: values.options?.maxTokens ?? null
      });
    });
  }

  private updateProviderOptions(settings: ModelsSettings) {
    const options = settings.providers?.map(provider => ({
      label: provider.name,
      value: provider.id
    })) ?? [];
    this.providerOptions.set(options);
  }

  private collectPayload(): ModelsSettings {
    const assembleCategory = (key: ModelKey): ModelCategorySettings => {
      const group = this.form.get(key);
      const primary = (group?.get('primary')?.value as string) ?? '';
      const providerId = (group?.get('providerId')?.value as string) ?? '';
      const options: ModelCallOptions = {
        temperature: this.numberOrUndefined(group?.get('temperature')?.value),
        topP: this.numberOrUndefined(group?.get('topP')?.value),
        maxTokens: this.numberOrUndefined(group?.get('maxTokens')?.value)
      };
      const normalizedOptions = Object.fromEntries(
        Object.entries(options).filter(([, value]) => value !== undefined)
      ) as ModelCallOptions | undefined;

      return {
        primary: primary.trim(),
        providerId,
        ...(normalizedOptions && Object.keys(normalizedOptions).length ? { options: normalizedOptions } : {})
      };
    };

    return {
      providers: this.providers(),
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
}