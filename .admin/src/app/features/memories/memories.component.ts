import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { ConfirmationService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { Memory } from '../../data/models';

@Component({
  selector: 'app-memories',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputTextareaModule,
    ConfirmPopupModule,
    MessageModule
  ],
  templateUrl: './memories.component.html',
  styleUrl: './memories.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService]
})
export class MemoriesComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);

  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly showDialog = signal<boolean>(false);
  readonly memories = signal<Memory[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly createError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    label: ['', Validators.required],
    content: ['', Validators.required],
    conversationId: ['', Validators.required],
    successorId: ['']
  });

  readonly dialogTitle = computed(() => (this.editingId() ? 'Edit memory' : 'Create memory'));

  constructor() {
    this.loadMemories();
  }

  loadMemories() {
    this.loading.set(true);
    this.api
      .listMemories()
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (items) => {
          this.memories.set(items);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load memories')
      });
  }

  openDialog() {
    this.editingId.set(null);
    this.form.reset();
    this.createError.set(null);
    this.showDialog.set(true);
  }

  edit(memory: Memory) {
    this.editingId.set(memory.id);
    this.form.reset({
      label: memory.label,
      content: memory.content,
      conversationId: memory.conversationId,
      successorId: memory.successorId ?? ''
    });
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

    const value = this.form.getRawValue();
    const successorId = value.successorId?.trim() || undefined;
    const editingId = this.editingId();
    const body = {
      label: value.label.trim(),
      content: value.content.trim(),
      conversationId: value.conversationId.trim(),
      ...(successorId ? { successorId } : {})
    };

    const request$ = editingId ? this.api.updateMemory(editingId, body) : this.api.createMemory(body);

    request$
      .pipe(
        takeUntilDestroyed(),
        catchError((err) => {
          const detail =
            (err?.error && (err.error.error ?? err.error.detail ?? err.error.message)) ||
            (typeof err === 'string' ? err : null);
          const message = detail ? `Unable to save memory: ${detail}` : 'Unable to save memory';
          this.createError.set(message);
          this.error.set(message);
          return EMPTY;
        }),
        finalize(() => this.saving.set(false))
      )
      .subscribe((memory) => {
        this.upsertMemory(memory);
        this.showDialog.set(false);
      });
  }

  refresh(memory: Memory) {
    this.api
      .refreshMemory(memory.id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (updated) => this.upsertMemory(updated),
        error: () => this.error.set('Unable to refresh memory')
      });
  }

  confirmDelete(event: Event, memory: Memory) {
    this.confirm.confirm({
      target: event.target as HTMLElement,
      message: `Delete memory "${memory.label}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      dismissableMask: true,
      accept: () => this.delete(memory.id)
    });
  }

  private delete(id: string) {
    this.api
      .deleteMemory(id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => this.memories.set(this.memories().filter((m) => m.id !== id)),
        error: () => this.error.set('Unable to delete memory')
      });
  }

  private upsertMemory(memory: Memory) {
    const existing = this.memories().find((m) => m.id === memory.id);
    if (existing) {
      this.memories.set(this.memories().map((m) => (m.id === memory.id ? memory : m)));
    } else {
      this.memories.set([memory, ...this.memories()]);
    }
  }

  previewText(content: string) {
    if (content.length <= 80) return content;
    return `${content.slice(0, 77)}...`;
  }
}

