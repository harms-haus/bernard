// core/src/lib/auth/auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Note: We cannot import the actual auth object here because it requires
// Redis to be running. We test the configuration structure instead.

// ============================================================================
// Test 5.2.1: Configuration
// ============================================================================

describe('auth.ts', () => {
  describe('Configuration', () => {
    it('should export auth object', async () => {
      // Dynamic import to avoid Redis connection during test setup
      const { auth } = await import('./auth');
      
      expect(auth).toBeDefined();
    });

    it('should configure emailAndPassword plugin', async () => {
      const { auth } = await import('./auth');
      
      expect(auth.options).toBeDefined();
      expect(auth.options.emailAndPassword).toBeDefined();
      expect(auth.options.emailAndPassword.enabled).toBe(true);
    });

    it('should configure admin plugin', async () => {
      const { auth } = await import('./auth');
      
      expect(auth.options).toBeDefined();
      expect(auth.options.plugins).toBeDefined();
      expect(auth.options.plugins.length).toBeGreaterThan(0);
      
      // Check that admin plugin is included
      // Better-Auth admin plugin has id === 'admin'
      const hasAdminPlugin = auth.options.plugins.some(
        (plugin: unknown) => {
          return typeof plugin === 'object' && plugin !== null && 'id' in plugin && (plugin as { id: string }).id === 'admin';
        }
      );
      expect(hasAdminPlugin).toBe(true);
    });
  });

  describe('Database Hooks', () => {
    it('should have databaseHooks configuration', async () => {
      const { auth } = await import('./auth');
      
      expect(auth.options.databaseHooks).toBeDefined();
      expect(auth.options.databaseHooks.user).toBeDefined();
      expect(auth.options.databaseHooks.user.create).toBeDefined();
    });
  });
});
