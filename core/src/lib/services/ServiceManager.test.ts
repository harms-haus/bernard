import { describe, it, expect, beforeEach } from 'vitest'
import { ServiceManager } from './ServiceManager'
import { SERVICES, SERVICE_START_ORDER } from './ServiceConfig'

describe('ServiceManager', () => {
  let serviceManager: ServiceManager

  beforeEach(() => {
    serviceManager = new ServiceManager()
  })

  describe('ServiceConfig', () => {
    it('should have all required services defined', () => {
      expect(SERVICES.redis).toBeDefined()
      expect(SERVICES['bernard-agent']).toBeDefined()
      expect(SERVICES['bernard-ui']).toBeDefined()
      expect(SERVICES.whisper).toBeDefined()
      expect(SERVICES.kokoro).toBeDefined()
    })

    it('should have correct service types', () => {
      expect(SERVICES.redis.type).toBe('docker')
      expect(SERVICES['bernard-agent'].type).toBe('node')
      expect(SERVICES.whisper.type).toBe('cpp')
    })

    it('should have valid startup order', () => {
      expect(SERVICE_START_ORDER).toContain('redis')
      expect(SERVICE_START_ORDER).toContain('bernard-agent')
      expect(SERVICE_START_ORDER).toContain('bernard-ui')
      expect(SERVICE_START_ORDER.indexOf('redis')).toBeLessThan(SERVICE_START_ORDER.indexOf('bernard-agent'))
      expect(SERVICE_START_ORDER.indexOf('bernard-agent')).toBeLessThan(SERVICE_START_ORDER.indexOf('bernard-ui'))
    })

    it('should have correct dependencies', () => {
      expect(SERVICES['bernard-agent'].dependencies).toContain('redis')
      expect(SERVICES['bernard-ui'].dependencies).toContain('redis')
    })

    it('should have valid port numbers', () => {
      for (const [id, service] of Object.entries(SERVICES)) {
        if (service.port) {
          expect(service.port).toBeGreaterThan(0)
          expect(service.port).toBeLessThan(65536)
        }
      }
    })

    it('should have unique IDs', () => {
      const ids = Object.values(SERVICES).map(s => s.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  describe('getStatus', () => {
    it('should return null for unknown service', async () => {
      const status = await serviceManager.getStatus('unknown-service')
      expect(status).toBeNull()
    })

    it('should return service status for valid service', async () => {
      const status = await serviceManager.getStatus('redis')
      expect(status).toBeDefined()
      expect(status?.id).toBe('redis')
      expect(status?.name).toBe('REDIS')
    })
  })

  describe('getAllStatus', () => {
    it('should return status for all services', async () => {
      const statuses = await serviceManager.getAllStatus()
      expect(statuses).toHaveLength(Object.keys(SERVICES).length)
    })

    it('should include all service properties', async () => {
      const statuses = await serviceManager.getAllStatus()
      for (const status of statuses) {
        expect(status.id).toBeDefined()
        expect(status.name).toBeDefined()
        expect(status.status).toBeDefined()
        expect(status.health).toBeDefined()
        expect(status.color).toBeDefined()
      }
    })
  })

  describe('getUptime', () => {
    it('should return null for non-running service', async () => {
      const uptime = await serviceManager.getUptime('redis')
      expect(uptime).toBeNull()
    })
  })

  describe('healthCheck', () => {
    it('should return health status for valid service', async () => {
      const health = await serviceManager.healthCheck('redis')
      expect(health).toBeDefined()
      expect(health?.service).toBe('redis')
    })

    it('should return down status for unknown service (not null)', async () => {
      const health = await serviceManager.healthCheck('unknown-service')
      expect(health).toBeDefined()
      expect(health?.service).toBe('unknown-service')
      expect(health?.status).toBe('down')
      expect(health?.error).toBe('Unknown service')
    })
  })

  describe('healthCheckAll', () => {
    it('should return health status for all services', async () => {
      const healthMap = await serviceManager.healthCheckAll()
      expect(healthMap.size).toBe(Object.keys(SERVICES).length)
    })
  })
})
