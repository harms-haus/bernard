import { Routes } from '@angular/router';

import { adminGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'dashboard',
    canMatch: [adminGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
  },
  {
    path: 'tokens',
    canMatch: [adminGuard],
    loadComponent: () => import('./features/tokens/tokens.component').then((m) => m.TokensComponent)
  },
  {
    path: 'memories',
    canMatch: [adminGuard],
    loadComponent: () => import('./features/memories/memories.component').then((m) => m.MemoriesComponent)
  },
  {
    path: 'services',
    canMatch: [adminGuard],
    loadComponent: () => import('./features/services/services.component').then((m) => m.ServicesComponent)
  },
  {
    path: 'history/:id',
    canMatch: [adminGuard],
    loadComponent: () =>
      import('./features/history/conversation.component').then((m) => m.ConversationComponent)
  },
  {
    path: 'history',
    canMatch: [adminGuard],
    loadComponent: () => import('./features/history/history.component').then((m) => m.HistoryComponent)
  },
  {
    path: 'chat',
    canMatch: [adminGuard],
    loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent)
  },
  {
    path: 'users',
    canMatch: [adminGuard],
    loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent)
  },
  { path: '**', redirectTo: 'dashboard' }
];
