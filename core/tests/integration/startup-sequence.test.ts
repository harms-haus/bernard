import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ServiceManager } from '@/lib/services/ServiceManager'
import { SERVICES, SERVICE_START_ORDER } from '@/lib/services/ServiceConfig'

describe('Integration: Startup Sequence', () => {
  let serviceManager: ServiceManager
  const TEST_DIR = path.join(process.cwd(), 'test-temp')
  const LOGS_DIR = path.join(TEST_DIR, 'logs')
  const PIDS_DIR = path.join(TEST_DIR, 'pids')

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true })
    }
    if (!fs.existsSync(PIDS_DIR)) {
      fs.mkdirSync(PIDS_DIR, { recursive: true })
    }
    vi.stubEnv('LOG_DIR', LOGS_DIR)
    vi.stubEnv('TZ', 'America/Chicago')
    serviceManager = new ServiceManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Service Dependencies', () => {
    it('should have correct dependency order for all services', () => {
      const order = SERVICE_START_ORDER

      expect(order[0]).toBe('redis')

      const agentIndex = order.indexOf('bernard-agent')
      expect(agentIndex).toBeGreaterThan(0)

      const uiIndex = order.indexOf('bernard-ui')
      expect(uiIndex).toBeGreaterThan(agentIndex)
    })

    it('should have no circular dependencies', () => {
      const visited = new Set<string>()
      const recursionStack = new Set<string>()

      function hasCycle(serviceId: string): boolean {
        if (recursionStack.has(serviceId)) return true
        if (visited.has(serviceId)) return false

        visited.add(serviceId)
        recursionStack.add(serviceId)

        const service = SERVICES[serviceId]
        if (service && service.dependencies) {
          for (const dep of service.dependencies) {
            if (hasCycle(dep)) return true
          }
        }

        recursionStack.delete(serviceId)
        return false
      }

      for (const serviceId of Object.keys(SERVICES)) {
        visited.clear()
        recursionStack.clear()
        expect(hasCycle(serviceId)).toBe(false)
      }
    })

    it('should have all dependencies defined in SERVICES', () => {
      for (const [id, service] of Object.entries(SERVICES)) {
        for (const dep of service.dependencies || []) {
          expect(SERVICES[dep]).toBeDefined()
        }
      }
    })
  })

  describe('Service Status Reporting', () => {
    it('should report status for all services in startup order', async () => {
      const statuses = await serviceManager.getAllStatus()

      expect(statuses).toHaveLength(Object.keys(SERVICES).length)

      const statusIds = statuses.map(s => s.id)
      for (let i = 1; i < statusIds.length; i++) {
        const prevIndex = SERVICE_START_ORDER.indexOf(statusIds[i - 1] as any)
        const currIndex = SERVICE_START_ORDER.indexOf(statusIds[i] as any)
        if (prevIndex !== -1 && currIndex !== -1) {
          expect(currIndex).toBeGreaterThanOrEqual(prevIndex)
        }
      }
    })

    it('should include essential properties in status', async () => {
      const statuses = await serviceManager.getAllStatus()

      for (const status of statuses) {
        expect(status.id).toBeDefined()
        expect(status.name).toBeDefined()
        expect(status.status).toBeDefined()
        expect(status.health).toBeDefined()
        expect(status.color).toBeDefined()

        expect(['running', 'stopped', 'starting', 'failed']).toContain(status.status)
        expect(['healthy', 'unhealthy', 'unknown']).toContain(status.health)
      }
    })
  })

  describe('Service Health Checks', () => {
    it('should return health status for all services', async () => {
      const healthMap = await serviceManager.healthCheckAll()

      expect(healthMap.size).toBe(Object.keys(SERVICES).length)

      for (const [serviceId, health] of healthMap) {
        expect(health.service).toBe(serviceId)
        expect(['up', 'down', 'starting', 'degraded']).toContain(health.status)
        expect(health.lastChecked).toBeInstanceOf(Date)
      }
    })

    it('should handle unknown service gracefully', async () => {
      const status = await serviceManager.getStatus('nonexistent-service')
      expect(status).toBeNull()

      const health = await serviceManager.healthCheck('nonexistent-service')
      expect(health).toBeDefined()
      expect(health?.service).toBe('nonexistent-service')
      expect(health?.status).toBe('down')
      expect(health?.error).toBe('Unknown service')
    })
  })

  describe('Service Configuration', () => {
    it('should have unique ports for all port-assigned services', () => {
      const ports: number[] = []

      for (const [id, service] of Object.entries(SERVICES)) {
        if (service.port) {
          ports.push(service.port)
        }
      }

      const uniquePorts = new Set(ports)
      expect(uniquePorts.size).toBe(ports.length)
    })

    it('should have valid port range', () => {
      for (const [id, service] of Object.entries(SERVICES)) {
        if (service.port) {
          expect(service.port).toBeGreaterThan(0)
          expect(service.port).toBeLessThan(65536)
        }
      }
    })

    it('should have reasonable startup timeout', () => {
      for (const [id, service] of Object.entries(SERVICES)) {
        expect(service.startupTimeout).toBeGreaterThan(0)
        expect(service.startupTimeout).toBeLessThan(300)
      }
    })
  })
})
