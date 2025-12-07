import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { ConfirmationService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { CheckboxModule } from 'primeng/checkbox';
import { MenuModule } from 'primeng/menu';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { User, UserStatus } from '../../data/models';

@Component({
  selector: 'app-users',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TagModule,
    ConfirmPopupModule,
    MessageModule,
    CheckboxModule,
    MenuModule
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService]
})
export class UsersComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly fb = inject(FormBuilder);
  private readonly confirm = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly showDialog = signal<boolean>(false);
  readonly users = signal<User[]>([]);
  readonly error = signal<string | null>(null);
  readonly createError = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    id: ['', Validators.required],
    displayName: ['', Validators.required],
    isAdmin: [false]
  });

  readonly dialogTitle = computed(() => (this.editingId() ? 'Edit user' : 'Create user'));

  constructor() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.api
      .listUsers()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (value) => {
          this.users.set(value);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load users')
      });
  }

  statusSeverity(user: User): 'success' | 'warning' | 'danger' {
    if (user.status === 'active') return 'success';
    if (user.status === 'disabled') return 'warning';
    return 'danger';
  }

  openCreate() {
    this.editingId.set(null);
    this.form.reset({ id: '', displayName: '', isAdmin: false });
    this.createError.set(null);
    this.showDialog.set(true);
  }

  edit(user: User) {
    this.editingId.set(user.id);
    this.form.reset({ id: user.id, displayName: user.displayName, isAdmin: user.isAdmin });
    this.createError.set(null);
    this.showDialog.set(true);
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { id, displayName, isAdmin } = this.form.getRawValue();
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      this.createError.set('Display name is required');
      return;
    }
    this.saving.set(true);
    this.createError.set(null);
    const editingId = this.editingId();
    const request$ = editingId
      ? this.api.updateUser(editingId, { displayName: trimmedName, isAdmin })
      : this.api.createUser({ id: id.trim(), displayName: trimmedName, isAdmin });

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((err) => {
          const detail =
            (err?.error && (err.error.error ?? err.error.detail ?? err.error.message)) ||
            (typeof err === 'string' ? err : null);
          const message = detail ? `Unable to save user: ${detail}` : 'Unable to save user';
          this.createError.set(message);
          this.error.set(message);
          return EMPTY;
        }),
        finalize(() => this.saving.set(false))
      )
      .subscribe((user) => {
        if (editingId) {
          this.users.set(this.users().map((u) => (u.id === user.id ? user : u)));
        } else {
          this.users.set([...this.users(), user]);
        }
        this.showDialog.set(false);
      });
  }

  toggleStatus(user: User) {
    const nextStatus: UserStatus = user.status === 'active' ? 'disabled' : 'active';
    this.api
      .updateUser(user.id, { status: nextStatus })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => this.users.set(this.users().map((u) => (u.id === updated.id ? updated : u))),
        error: () => this.error.set('Unable to update user status')
      });
  }

  resetPassword(user: User) {
    this.api
      .resetUser(user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.error.set(null),
        error: () => this.error.set('Unable to reset user')
      });
  }

  confirmDelete(event: Event, user: User) {
    this.confirm.confirm({
      target: event.target as HTMLElement,
      message: `Delete user "${user.displayName}"? This cannot be undone.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      dismissableMask: true,
      accept: () => this.deleteUser(user.id)
    });
  }

  private deleteUser(id: string) {
    this.api
      .deleteUser(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => this.users.set(this.users().map((u) => (u.id === user.id ? user : u))),
        error: () => this.error.set('Unable to delete user')
      });
  }

  menuItems(user: User) {
    const isDisabled = user.status === 'disabled';
    const toggleLabel = isDisabled ? 'Enable' : 'Disable';
    const toggleIcon = isDisabled ? 'pi pi-check' : 'pi pi-ban';
    return [
      { label: 'Edit', icon: 'pi pi-pencil', command: () => this.edit(user) },
      { label: toggleLabel, icon: toggleIcon, command: () => this.toggleStatus(user) },
      { label: 'Reset password', icon: 'pi pi-refresh', command: () => this.resetPassword(user) },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        command: (event?: { originalEvent?: Event }) =>
          this.confirmDelete(event?.originalEvent ?? (event as unknown as Event), user)
      }
    ];
  }
}

