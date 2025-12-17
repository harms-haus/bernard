import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { API_CLIENT, ApiClient, provideApiClient } from './api.service';

describe('ApiClient (mock)', () => {
  let api: ApiClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideApiClient()]
    });
    api = TestBed.inject<ApiClient>(API_CLIENT);
  });

  it('returns status', async () => {
    const status = await firstValueFrom(api.getStatus());
    expect(status.status).toBeDefined();
    expect(status.uptimeSeconds).toBeGreaterThan(0);
  });

  it('creates a token', async () => {
    const token = await firstValueFrom(api.createToken({ name: 'test-token' }));
    expect(token.name).toBe('test-token');
    expect(token.id).toBeTruthy();
  });
});
