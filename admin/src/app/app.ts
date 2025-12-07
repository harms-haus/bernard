import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { MenuItem } from 'primeng/api';
import { TabMenuModule } from 'primeng/tabmenu';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    TabMenuModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  private readonly router = inject(Router);

  protected readonly items = signal<MenuItem[]>([
    { label: 'Dashboard', icon: 'pi pi-home', routerLink: '/dashboard', routerLinkActiveOptions: { exact: true } },
    { label: 'Access Tokens', icon: 'pi pi-key', routerLink: '/tokens' },
    { label: 'Services', icon: 'pi pi-server', routerLink: '/services' },
    { label: 'History', icon: 'pi pi-history', routerLink: '/history' }
  ]);

  protected readonly activeItem = signal<MenuItem | undefined>(undefined);

  constructor() {
    this.syncActiveItem(this.router.url);

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe((event) => this.syncActiveItem(event.urlAfterRedirects));
  }

  protected onTabChange(item: MenuItem) {
    this.activeItem.set(item);
  }

  private syncActiveItem(url: string) {
    const match = this.items().find((item) => {
      const link = item.routerLink;
      if (typeof link === 'string') {
        return url === link || url.startsWith(`${link}/`);
      }
      if (Array.isArray(link)) {
        const path = link.join('/');
        return url === `/${path}` || url.startsWith(`/${path}/`);
      }
      return false;
    });

    this.activeItem.set(match ?? undefined);
  }
}
