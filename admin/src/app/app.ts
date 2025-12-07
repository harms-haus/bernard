import { ChangeDetectionStrategy, Component, effect, inject, signal, computed } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { AvatarModule } from 'primeng/avatar';

import { AuthService } from './data/auth.service';

const THEME_STORAGE_KEY = 'bernard-admin-theme';
const PRIME_NG_THEME_VERSION = '17.18.6';

const prefersDark = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

const loadStoredThemePreference = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'dark') {
    return true;
  }

  if (stored === 'light') {
    return false;
  }

  return prefersDark();
};

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MenubarModule,
    ButtonModule,
    MenuModule,
    AvatarModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  readonly items = signal<MenuItem[]>([
    { label: 'Dashboard', icon: 'pi pi-home', routerLink: '/dashboard', routerLinkActiveOptions: { exact: true } },
    { label: 'Access Tokens', icon: 'pi pi-key', routerLink: '/tokens' },
    { label: 'Services', icon: 'pi pi-server', routerLink: '/services' },
    { label: 'History', icon: 'pi pi-history', routerLink: '/history' },
    { label: 'Users', icon: 'pi pi-users', routerLink: '/users' }
  ]);

  readonly darkModeEnabled = signal<boolean>(loadStoredThemePreference());
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly user = this.auth.currentUser;
  readonly profileMenuItems = computed<MenuItem[]>(() => [
    {
      label: 'Logout',
      icon: 'pi pi-sign-out',
      command: () => this.logout()
    }
  ]);
  readonly profileInitial = computed(() => (this.user()?.displayName?.[0] ?? '?').toUpperCase());

  constructor() {
    this.auth.ensureUser().subscribe();
    effect(() => {
      const isDark = this.darkModeEnabled();
      applyDocumentTheme(isDark);
      persistThemePreference(isDark);
    });
  }

  toggleDarkMode(): void {
    this.darkModeEnabled.update((value) => !value);
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login'])
    });
  }
}

const persistThemePreference = (isDark: boolean): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
};

const applyDocumentTheme = (isDark: boolean): void => {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.classList.toggle('app-dark', isDark);

  const themeLink = document.getElementById('primeng-theme') as HTMLLinkElement | null;
  if (!themeLink) {
    return;
  }

  const themeName = isDark ? 'lara-dark-blue' : 'lara-light-blue';
  const nextHref = `https://unpkg.com/primeng@${PRIME_NG_THEME_VERSION}/resources/themes/${themeName}/theme.css`;

  if (themeLink.getAttribute('href') !== nextHref) {
    themeLink.setAttribute('href', nextHref);
  }
};
