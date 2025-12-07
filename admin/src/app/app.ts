import { ChangeDetectionStrategy, Component, effect, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';

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
    ButtonModule
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
    { label: 'History', icon: 'pi pi-history', routerLink: '/history' }
  ]);

  readonly darkModeEnabled = signal<boolean>(loadStoredThemePreference());

  constructor() {
    effect(() => {
      const isDark = this.darkModeEnabled();
      applyDocumentTheme(isDark);
      persistThemePreference(isDark);
    });
  }

  toggleDarkMode(): void {
    this.darkModeEnabled.update((value) => !value);
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
