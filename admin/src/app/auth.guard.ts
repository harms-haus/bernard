import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { catchError, of, tap } from 'rxjs';

import { AuthService } from './data/auth.service';

export const adminGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.requireAdmin().pipe(
    tap((isAdmin) => {
      if (!isAdmin) {
        router.navigate(['/login']);
      }
    }),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    })
  );
};

