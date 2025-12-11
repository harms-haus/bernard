import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TabMenuModule } from 'primeng/tabmenu';
import type { MenuItem } from 'primeng/api';

type Provider = 'google' | 'github';

@Component({
  selector: 'app-services-oauth-section',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputTextModule, TabMenuModule],
  template: `
    <p-tabMenu [model]="tabs" [activeItem]="activeItem()" (activeItemChange)="onTabChange($event)"></p-tabMenu>
    <div class="oauth-form" [formGroup]="activeGroup()">
      <div class="grid two-col">
        <label class="field">
          <span class="label">Auth URL</span>
          <input pInputText formControlName="authUrl" />
        </label>
        <label class="field">
          <span class="label">Token URL</span>
          <input pInputText formControlName="tokenUrl" />
        </label>
        <label class="field">
          <span class="label">Userinfo URL</span>
          <input pInputText formControlName="userInfoUrl" />
        </label>
        <label class="field">
          <span class="label">Redirect URI</span>
          <input pInputText formControlName="redirectUri" />
        </label>
        <label class="field">
          <span class="label">Scopes</span>
          <input pInputText formControlName="scope" />
        </label>
        <label class="field">
          <span class="label">Client ID</span>
          <input pInputText formControlName="clientId" />
        </label>
        <label class="field">
          <span class="label">Client secret</span>
          <input pInputText type="password" formControlName="clientSecret" />
        </label>
      </div>
    </div>
  `,
  styleUrl: './services-oauth-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesOauthSectionComponent {
  @Input({ required: true }) googleGroup!: FormGroup;
  @Input({ required: true }) githubGroup!: FormGroup;

  protected readonly tabs: MenuItem[] = [
    { id: 'google', label: 'Google' },
    { id: 'github', label: 'GitHub' }
  ];
  protected readonly active = signal<Provider>('google');

  protected activeItem() {
    return this.tabs.find((t) => t.id === this.active());
  }

  protected onTabChange(item: MenuItem) {
    const id = (item.id as Provider | undefined) ?? 'google';
    this.active.set(id);
  }

  protected activeGroup(): FormGroup {
    return this.active() === 'google' ? this.googleGroup : this.githubGroup;
  }
}

