import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of, tap } from 'rxjs';

import { API_CLIENT, ApiClient } from './api.service';
import { User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly router = inject(Router);

  readonly currentUser = signal<User | null>(null);
  readonly loading = signal<boolean>(false);

  ensureUser() {
    this.loading.set(true);
    return this.api.getMe().pipe(
      tap((user) => {
        this.currentUser.set(user);
        this.loading.set(false);
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.currentUser.set(null);
        }
        this.loading.set(false);
        return of(null);
      })
    );
  }

  requireAdmin() {
    return this.ensureUser().pipe(
      map((user) => Boolean(user?.isAdmin)),
      tap((isAdmin) => {
        if (!isAdmin) {
          this.router.navigate(['/login']);
        }
      })
    );
  }

  logout() {
    return this.api.logout().pipe(
      tap(() => {
        this.currentUser.set(null);
      })
    );
  }
}

