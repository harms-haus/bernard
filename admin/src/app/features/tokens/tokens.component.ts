import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { Token } from '../../data/models';

@Component({
  selector: 'app-tokens',
  imports: [CommonModule, ReactiveFormsModule, TableModule, ButtonModule, DialogModule, InputTextModule, InputTextareaModule, TagModule],
  templateUrl: './tokens.component.html',
  styleUrl: './tokens.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TokensComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal<boolean>(true);
  protected readonly saving = signal<boolean>(false);
  protected readonly showDialog = signal<boolean>(false);
  protected readonly tokens = signal<Token[]>([]);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    metadata: ['']
  });

  protected readonly totalCalls = computed(() =>
    this.tokens()
      .map((t) => t.usage.calls)
      .reduce((sum, value) => sum + value, 0)
  );

  constructor() {
    this.loadTokens();
  }

  protected loadTokens() {
    this.loading.set(true);
    this.api
      .listTokens()
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (value) => {
          this.tokens.set(value);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load tokens')
      });
  }

  protected openDialog() {
    this.form.reset();
    this.showDialog.set(true);
  }

  protected save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const metadata = this.parseMetadata(this.form.controls.metadata.value);
    this.api
      .createToken({ name: this.form.controls.name.value, metadata })
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.saving.set(false))
      )
      .subscribe({
        next: (token) => {
          this.tokens.set([...this.tokens(), token]);
          this.showDialog.set(false);
        },
        error: () => this.error.set('Unable to create token')
      });
  }

  protected deleteToken(id: string) {
    if (!confirm('Delete this token?')) {
      return;
    }
    this.api
      .deleteToken(id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => this.tokens.set(this.tokens().filter((t) => t.id !== id)),
        error: () => this.error.set('Unable to delete token')
      });
  }

  protected statusSeverity(token: Token) {
    if (token.status === 'active') {
      return 'success';
    }
    return 'danger';
  }

  protected metadataText(metadata?: Record<string, string>) {
    if (!metadata) {
      return '—';
    }
    return Object.entries(metadata)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  private parseMetadata(text: string) {
    if (!text.trim()) {
      return undefined;
    }
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce<Record<string, string>>((acc, line) => {
        const [key, ...rest] = line.split(':');
        if (key && rest.length) {
          acc[key.trim()] = rest.join(':').trim();
        }
        return acc;
      }, {});
  }
}
