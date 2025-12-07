import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, finalize, timeout } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { ConfirmationService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { Token } from '../../data/models';

@Component({
  selector: 'app-tokens',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TagModule,
    ConfirmPopupModule,
    MessageModule
  ],
  templateUrl: './tokens.component.html',
  styleUrl: './tokens.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService]
})
export class TokensComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly showDialog = signal<boolean>(false);
  readonly tokens = signal<Token[]>([]);
  readonly error = signal<string | null>(null);
  readonly latestSecret = signal<{ name: string; token: string } | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly createError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required]
  });

  readonly dialogTitle = computed(() => (this.editingId() ? 'Rename token' : 'Create token'));

  constructor() {
    this.loadTokens();
  }

  loadTokens() {
    this.loading.set(true);
    this.api
      .listTokens()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
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

  openDialog() {
    this.editingId.set(null);
    this.form.reset();
    this.createError.set(null);
    this.showDialog.set(true);
  }

  edit(token: Token) {
    this.editingId.set(token.id);
    this.form.reset({ name: token.name });
    this.createError.set(null);
    this.showDialog.set(true);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.createError.set(null);

    const name = this.form.controls.name.value.trim();
    const editingId = this.editingId();
    const request$ = editingId
      ? this.api.updateToken(editingId, { name })
      : this.api.createToken({ name });

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        timeout(10000),
        catchError((err) => {
          const detail =
            (err?.error && (err.error.error ?? err.error.detail ?? err.error.message)) ||
            (typeof err === 'string' ? err : null);
          const message = detail ? `Unable to save token: ${detail}` : 'Unable to save token';
          this.createError.set(message);
          this.error.set(message);
          return EMPTY;
        }),
        finalize(() => this.saving.set(false))
      )
      .subscribe({
        next: (token) => {
          if (editingId) {
            this.tokens.set(this.tokens().map((t) => (t.id === token.id ? token : t)));
          } else {
            this.tokens.set([...this.tokens(), token]);
            if (token.token) {
              this.latestSecret.set({ name: token.name, token: token.token });
            }
          }
          this.showDialog.set(false);
        }
      });
  }

  toggleStatus(token: Token) {
    const nextStatus = token.status === 'active' ? 'disabled' : 'active';
    this.api
      .updateToken(token.id, { status: nextStatus })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => this.tokens.set(this.tokens().map((t) => (t.id === updated.id ? updated : t))),
        error: () => this.error.set('Unable to update token status')
      });
  }

  confirmDelete(event: Event, id: string, name: string) {
    this.confirm.confirm({
      target: event.target as HTMLElement,
      message: `Delete token "${name}"? This cannot be undone.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      dismissableMask: true,
      accept: () => this.deleteToken(id)
    });
  }

  private deleteToken(id: string) {
    this.api
      .deleteToken(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.tokens.set(this.tokens().filter((t) => t.id !== id)),
        error: () => this.error.set('Unable to delete token')
      });
  }

  statusSeverity(token: Token) {
    if (token.status === 'active') {
      return 'success';
    }
    return 'warning';
  }

  copyLatestSecret(input: HTMLInputElement) {
    const value = input.value;
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {
      input.select();
      document.execCommand('copy');
    });
  }
}
