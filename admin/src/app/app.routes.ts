import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
  },
  {
    path: 'tokens',
    loadComponent: () => import('./features/tokens/tokens.component').then((m) => m.TokensComponent)
  },
  {
    path: 'services',
    loadComponent: () => import('./features/services/services.component').then((m) => m.ServicesComponent)
  },
  {
    path: 'history',
    loadComponent: () => import('./features/history/history.component').then((m) => m.HistoryComponent)
  },
  { path: '**', redirectTo: 'dashboard' }
];
