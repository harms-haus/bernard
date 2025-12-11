import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, FormGroup, FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { DropdownModule } from 'primeng/dropdown';
import { ListboxModule } from 'primeng/listbox';

import { API_CLIENT, ApiClient } from '../../data/api.service';
import { OAuthSettings, ServicesSettings, BackupSettings } from '../../data/models';
import { ServicesMemorySectionComponent } from './sections/services-memory-section.component';
import { ServicesSearchSectionComponent } from './sections/services-search-section.component';
import { ServicesGeocodingSectionComponent } from './sections/services-geocoding-section.component';
import { ServicesWeatherSectionComponent } from './sections/services-weather-section.component';
import { ServicesBackupsSectionComponent } from './sections/services-backups-section.component';
import { ServicesOauthSectionComponent } from './sections/services-oauth-section.component';

@Component({
  selector: 'app-services',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    DropdownModule,
    ListboxModule,
    ServicesMemorySectionComponent,
    ServicesSearchSectionComponent,
    ServicesGeocodingSectionComponent,
    ServicesWeatherSectionComponent,
    ServicesBackupsSectionComponent,
    ServicesOauthSectionComponent
  ],
  templateUrl: './services.component.html',
  styleUrl: './services.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesComponent {
  private readonly api = inject<ApiClient>(API_CLIENT);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal<boolean>(true);
  protected readonly saving = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected active: 'oauth' | 'memory' | 'search' | 'geocoding' | 'weather' | 'backups' = 'oauth';

  protected readonly units = [
    { label: 'Metric', value: 'metric' },
    { label: 'Imperial', value: 'imperial' }
  ];

  protected readonly navItems: Array<{ label: string; value: 'oauth' | 'memory' | 'search' | 'geocoding' | 'weather' | 'backups' }> = [
    { label: 'OAuth', value: 'oauth' },
    { label: 'Memory', value: 'memory' },
    { label: 'Search', value: 'search' },
    { label: 'Geocoding', value: 'geocoding' },
    { label: 'Weather', value: 'weather' },
    { label: 'Backups', value: 'backups' }
  ];

  protected get oauthGoogleGroup(): FormGroup {
    return this.form.get('oauth.google') as FormGroup;
  }
  protected get oauthGithubGroup(): FormGroup {
    return this.form.get('oauth.github') as FormGroup;
  }
  protected get memoryGroup(): FormGroup {
    return this.form.get('services.memory') as FormGroup;
  }
  protected get searchGroup(): FormGroup {
    return this.form.get('services.search') as FormGroup;
  }
  protected get geocodingGroup(): FormGroup {
    return this.form.get('services.geocoding') as FormGroup;
  }
  protected get weatherGroup(): FormGroup {
    return this.form.get('services.weather') as FormGroup;
  }
  protected get backupsGroup(): FormGroup {
    return this.form.get('backups') as FormGroup;
  }

  protected readonly form = this.fb.group({
    services: this.fb.group({
      memory: this.fb.group({
        embeddingModel: [''],
        embeddingBaseUrl: [''],
        embeddingApiKey: [''],
        indexName: [''],
        keyPrefix: [''],
        namespace: ['']
      }),
      search: this.fb.group({
        apiKey: [''],
        apiUrl: ['']
      }),
      weather: this.fb.group({
        apiKey: [''],
        apiUrl: [''],
        forecastUrl: [''],
        historicalUrl: [''],
        units: [''],
        timeoutMs: ['']
      }),
      geocoding: this.fb.group({
        url: [''],
        userAgent: [''],
        email: [''],
        referer: ['']
      })
    }),
    oauth: this.fb.group({
      google: this.buildOAuthGroup(),
      github: this.buildOAuthGroup()
    }),
    backups: this.fb.group({
      debounceSeconds: [''],
      directory: [''],
      retentionDays: [''],
      retentionCount: ['']
    })
  });

  constructor() {
    this.load();
  }

  protected load() {
    this.loading.set(true);
    forkJoin({
      services: this.api.getServicesSettings(),
      oauth: this.api.getOAuthSettings(),
      backups: this.api.getBackupSettings()
    })
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: (settings) => {
          this.patchServices(settings.services);
          this.patchOAuth(settings.oauth);
          this.patchBackups(settings.backups);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to load service settings')
      });
  }

  protected save() {
    if (this.saving()) return;
    const services = this.collectServices();
    const oauth = this.collectOAuth();
    const backups = this.collectBackups();
    this.saving.set(true);
    forkJoin({
      services: this.api.updateServicesSettings(services),
      oauth: this.api.updateOAuthSettings(oauth),
      backups: this.api.updateBackupSettings(backups)
    })
      .pipe(
        takeUntilDestroyed(),
        finalize(() => this.saving.set(false))
      )
      .subscribe({
        next: ({ services: svc, oauth: oauthSaved, backups: backupsSaved }) => {
          this.patchServices(svc);
          this.patchOAuth(oauthSaved);
          this.patchBackups(backupsSaved);
          this.error.set(null);
        },
        error: () => this.error.set('Unable to save service settings')
      });
  }

  private buildOAuthGroup() {
    return this.fb.group({
      authUrl: [''],
      tokenUrl: [''],
      userInfoUrl: [''],
      redirectUri: [''],
      scope: [''],
      clientId: [''],
      clientSecret: ['']
    });
  }

  private patchServices(services: ServicesSettings) {
    this.form.get('services')?.patchValue({
      memory: {
        embeddingModel: services.memory.embeddingModel ?? '',
        embeddingBaseUrl: services.memory.embeddingBaseUrl ?? '',
        embeddingApiKey: services.memory.embeddingApiKey ?? '',
        indexName: services.memory.indexName ?? '',
        keyPrefix: services.memory.keyPrefix ?? '',
        namespace: services.memory.namespace ?? ''
      },
      search: {
        apiKey: services.search.apiKey ?? '',
        apiUrl: services.search.apiUrl ?? ''
      },
      weather: {
        apiKey: services.weather.apiKey ?? '',
        apiUrl: services.weather.apiUrl ?? '',
        forecastUrl: services.weather.forecastUrl ?? '',
        historicalUrl: services.weather.historicalUrl ?? '',
        units: services.weather.units ?? '',
        timeoutMs: services.weather.timeoutMs != null ? String(services.weather.timeoutMs) : ''
      },
      geocoding: {
        url: services.geocoding.url ?? '',
        userAgent: services.geocoding.userAgent ?? '',
        email: services.geocoding.email ?? '',
        referer: services.geocoding.referer ?? ''
      }
    });
  }

  private patchOAuth(oauth: OAuthSettings) {
    this.form.get('oauth')?.patchValue({
      google: {
        authUrl: oauth.google.authUrl ?? '',
        tokenUrl: oauth.google.tokenUrl ?? '',
        userInfoUrl: oauth.google.userInfoUrl ?? '',
        redirectUri: oauth.google.redirectUri ?? '',
        scope: oauth.google.scope ?? '',
        clientId: oauth.google.clientId ?? '',
        clientSecret: oauth.google.clientSecret ?? ''
      },
      github: {
        authUrl: oauth.github.authUrl ?? '',
        tokenUrl: oauth.github.tokenUrl ?? '',
        userInfoUrl: oauth.github.userInfoUrl ?? '',
        redirectUri: oauth.github.redirectUri ?? '',
        scope: oauth.github.scope ?? '',
        clientId: oauth.github.clientId ?? '',
        clientSecret: oauth.github.clientSecret ?? ''
      }
    });
  }

  private patchBackups(backups: BackupSettings) {
    this.form.get('backups')?.patchValue({
      debounceSeconds: backups.debounceSeconds != null ? String(backups.debounceSeconds) : '',
      directory: backups.directory ?? '',
      retentionDays: backups.retentionDays != null ? String(backups.retentionDays) : '',
      retentionCount: backups.retentionCount != null ? String(backups.retentionCount) : ''
    });
  }

  private collectServices(): ServicesSettings {
    const servicesGroup = this.form.get('services');
    const raw = servicesGroup?.value as any;
    return {
      memory: {
        embeddingModel: this.stringOrUndefined(raw.memory.embeddingModel),
        embeddingBaseUrl: this.stringOrUndefined(raw.memory.embeddingBaseUrl),
        embeddingApiKey: this.stringOrUndefined(raw.memory.embeddingApiKey),
        indexName: this.stringOrUndefined(raw.memory.indexName),
        keyPrefix: this.stringOrUndefined(raw.memory.keyPrefix),
        namespace: this.stringOrUndefined(raw.memory.namespace)
      },
      search: {
        apiKey: this.stringOrUndefined(raw.search.apiKey),
        apiUrl: this.stringOrUndefined(raw.search.apiUrl)
      },
      weather: {
        apiKey: this.stringOrUndefined(raw.weather.apiKey),
        apiUrl: this.stringOrUndefined(raw.weather.apiUrl),
        forecastUrl: this.stringOrUndefined(raw.weather.forecastUrl),
        historicalUrl: this.stringOrUndefined(raw.weather.historicalUrl),
        units: this.stringOrUndefined(raw.weather.units) as 'metric' | 'imperial' | undefined,
        timeoutMs: this.numberOrUndefined(raw.weather.timeoutMs)
      },
      geocoding: {
        url: this.stringOrUndefined(raw.geocoding.url),
        userAgent: this.stringOrUndefined(raw.geocoding.userAgent),
        email: this.stringOrUndefined(raw.geocoding.email),
        referer: this.stringOrUndefined(raw.geocoding.referer)
      }
    };
  }

  private collectOAuth(): OAuthSettings {
    const oauthGroup = this.form.get('oauth');
    const raw = oauthGroup?.value as any;
    const normalizeClient = (client: any) => ({
      authUrl: client.authUrl,
      tokenUrl: client.tokenUrl,
      userInfoUrl: client.userInfoUrl,
      redirectUri: client.redirectUri,
      scope: client.scope,
      clientId: client.clientId,
      ...(client.clientSecret ? { clientSecret: client.clientSecret } : {})
    });
    const google = normalizeClient(raw.google ?? {});
    return {
      google,
      github: normalizeClient(raw.github ?? {}),
      default: google
    };
  }

  private collectBackups(): BackupSettings {
    const backups = (this.form.get('backups')?.value as any) ?? {
      debounceSeconds: '60',
      directory: './backups',
      retentionDays: '14',
      retentionCount: '20'
    };
    return {
      debounceSeconds: this.numberOrUndefined(backups.debounceSeconds) ?? 60,
      directory: backups.directory ?? './backups',
      retentionDays: this.numberOrUndefined(backups.retentionDays) ?? 14,
      retentionCount: this.numberOrUndefined(backups.retentionCount) ?? 20
    };
  }

  private numberOrUndefined(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  private stringOrUndefined(value: unknown): string | undefined {
    const str = typeof value === 'string' ? value.trim() : '';
    return str ? str : undefined;
  }
}
