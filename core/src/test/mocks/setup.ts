import { vi } from 'vitest';
import { authStateRef, createMockUseAuth } from './useAuth';

export function setupUseAuthMock(): void {
  vi.doMock('@/hooks/useAuth', () => ({
    useAuth: () => createMockUseAuth(authStateRef.current),
  }));
}
