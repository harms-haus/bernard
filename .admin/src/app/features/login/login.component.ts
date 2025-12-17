import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ButtonModule, CardModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  startLogin(provider: 'google' | 'github') {
    const redirectTarget = `${window.location.origin}/`;
    const redirect = encodeURIComponent(redirectTarget);
    const path = provider === 'google' ? '/api/auth/google/login' : '/api/auth/github/login';
    window.location.href = `${path}?redirect=${redirect}`;
  }
}

