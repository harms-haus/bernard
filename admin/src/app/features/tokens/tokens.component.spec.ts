import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { provideApiClient } from '../../data/api.service';
import { TokensComponent } from './tokens.component';

describe('TokensComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TokensComponent],
      providers: [provideHttpClient(), provideApiClient()]
    }).compileComponents();
  });

  it('renders tokens table', async () => {
    const fixture = TestBed.createComponent(TokensComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 200));
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as { tokens: () => unknown[] };
    expect(component.tokens().length).toBeGreaterThan(0);
  });
});
