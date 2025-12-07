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
    path: 'history/:id',
    loadComponent: () =>
      import('./features/history/conversation.component').then((m) => m.ConversationComponent)
  },
  {
    path: 'history',
    loadComponent: () => import('./features/history/history.component').then((m) => m.HistoryComponent)
  },
  {
    path: 'chat',
    loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent)
  },
  { path: '**', redirectTo: 'dashboard' }
];
