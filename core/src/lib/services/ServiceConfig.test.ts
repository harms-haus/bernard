import { describe, it, expect } from 'vitest';
import type { ServiceType, ServiceConfig } from './ServiceConfig';
import { SERVICES, SERVICE_START_ORDER, type ServiceId } from './ServiceConfig';

describe('ServiceConfig', () => {
  describe('ServiceType', () => {
    it('should accept valid service types', () => {
      const validTypes: ServiceType[] = ['docker', 'node', 'python', 'cpp'];
      validTypes.forEach(type => {
        expect(type).toBeDefined();
      });
    });
  });

  describe('SERVICES', () => {
    it('should define all required services', () => {
      expect(SERVICES.redis).toBeDefined();
      expect(SERVICES.core).toBeDefined();
      expect(SERVICES['bernard-agent']).toBeDefined();
      expect(SERVICES.whisper).toBeDefined();
      expect(SERVICES.kokoro).toBeDefined();
    });

    it('should have correct ports for each service', () => {
      expect(SERVICES.redis.port).toBe(6379);
      expect(SERVICES.core.port).toBe(3456);
      expect(SERVICES['bernard-agent'].port).toBe(2024);
      expect(SERVICES.whisper.port).toBe(8870);
      expect(SERVICES.kokoro.port).toBe(8880);
    });

    it('should have correct types for each service', () => {
      expect(SERVICES.redis.type).toBe('docker');
      expect(SERVICES.core.type).toBe('node');
      expect(SERVICES['bernard-agent'].type).toBe('node');
      expect(SERVICES.whisper.type).toBe('cpp');
      expect(SERVICES.kokoro.type).toBe('python');
    });

    it('should have non-empty display names', () => {
      Object.values(SERVICES).forEach(config => {
        expect(config.displayName).toBeTruthy();
        expect(config.displayName.length).toBeGreaterThan(0);
      });
    });

    it('should have non-empty ids', () => {
      Object.values(SERVICES).forEach(config => {
        expect(config.id).toBeTruthy();
        expect(config.id.length).toBeGreaterThan(0);
      });
    });

    it('should have reasonable startup timeouts', () => {
      Object.values(SERVICES).forEach(config => {
        expect(config.startupTimeout).toBeGreaterThan(0);
        expect(config.startupTimeout).toBeLessThanOrEqual(60);
      });
    });

    it('should have valid hex colors', () => {
      Object.values(SERVICES).forEach(config => {
        expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe('SERVICE_START_ORDER', () => {
    it('should include all service ids', () => {
      const orderIds = SERVICE_START_ORDER;
      const serviceIds = Object.keys(SERVICES);
      
      expect(orderIds.length).toBe(serviceIds.length);
      orderIds.forEach(id => {
        expect(SERVICES[id]).toBeDefined();
      });
    });

    it('should have redis first (no dependencies)', () => {
      expect(SERVICE_START_ORDER[0]).toBe('redis');
      expect(SERVICES.redis.dependencies).toHaveLength(0);
    });

    it('should have core after redis', () => {
      const redisIndex = SERVICE_START_ORDER.indexOf('redis');
      const coreIndex = SERVICE_START_ORDER.indexOf('core');
      expect(coreIndex).toBeGreaterThan(redisIndex);
      expect(SERVICES.core.dependencies).toContain('redis');
    });

    it('should have bernard-agent after redis', () => {
      const redisIndex = SERVICE_START_ORDER.indexOf('redis');
      const agentIndex = SERVICE_START_ORDER.indexOf('bernard-agent');
      expect(agentIndex).toBeGreaterThan(redisIndex);
      expect(SERVICES['bernard-agent'].dependencies).toContain('redis');
    });
  });

  describe('ServiceId type', () => {
    it('should be a union of all service ids', () => {
      const ids: ServiceId[] = ['redis', 'core', 'bernard-agent', 'whisper', 'kokoro'];
      ids.forEach(id => {
        expect(id).toBeDefined();
      });
    });
  });

  describe('service configuration completeness', () => {
    it('should have healthCheck or healthPath for each service', () => {
      Object.values(SERVICES).forEach(config => {
        expect(config.healthCheck || config.healthPath).toBeTruthy();
      });
    });

    it('should have dependency array for each service', () => {
      Object.values(SERVICES).forEach(config => {
        expect(config.dependencies).toBeDefined();
        expect(Array.isArray(config.dependencies)).toBe(true);
      });
    });

    it('should reference existing services in dependencies', () => {
      Object.values(SERVICES).forEach(config => {
        config.dependencies.forEach(dep => {
          expect(SERVICES[dep as keyof typeof SERVICES]).toBeDefined();
        });
      });
    });
  });
});
