import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ServiceManager } from '@/lib/services/ServiceManager'
import { SERVICES } from '@/lib/services/ServiceConfig'

describe('Integration: Service Commands', () => {
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

  describe('getStatus', () => {
    it('should return status object with all required fields', async () => {
      const status = await serviceManager.getStatus('redis')

      expect(status).toBeDefined()
      expect(status?.id).toBe('redis')
      expect(status?.name).toBe('REDIS')
      expect(status?.port).toBe(6379)
      expect(status?.color).toBe('#ff6b6b')
    })

    it('should return null for unknown service', async () => {
      const status = await serviceManager.getStatus('unknown-service')
      expect(status).toBeNull()
    })

    it('should return different statuses for different services', async () => {
      const redisStatus = await serviceManager.getStatus('redis')
      const coreStatus = await serviceManager.getStatus('core')

      expect(redisStatus?.id).not.toBe(coreStatus?.id)
      expect(redisStatus?.port).not.toBe(coreStatus?.port)
    })
  })

  describe('getAllStatus', () => {
    it('should return array of all service statuses', async () => {
      const statuses = await serviceManager.getAllStatus()

      expect(Array.isArray(statuses)).toBe(true)
      expect(statuses.length).toBeGreaterThan(0)
    })

    it('should contain all service IDs', async () => {
      const statuses = await serviceManager.getAllStatus()
      const statusIds = statuses.map(s => s.id)

      for (const serviceId of Object.keys(SERVICES)) {
        expect(statusIds).toContain(serviceId)
      }
    })

    it('should have unique entries for each service', async () => {
      const statuses = await serviceManager.getAllStatus()
      const ids = statuses.map(s => s.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(statuses.length)
    })
  })

  describe('healthCheck', () => {
    it('should return health status with timestamp', async () => {
      const health = await serviceManager.healthCheck('redis')

      expect(health).toBeDefined()
      expect(health?.service).toBe('redis')
      expect(health?.lastChecked).toBeInstanceOf(Date)
    })

    it('should return down status with error for unknown service', async () => {
      const health = await serviceManager.healthCheck('unknown-service')

      expect(health?.status).toBe('down')
      expect(health?.error).toBe('Unknown service')
    })
  })

  describe('healthCheckAll', () => {
    it('should return map of all service health statuses', async () => {
      const healthMap = await serviceManager.healthCheckAll()

      expect(healthMap instanceof Map).toBe(true)
      expect(healthMap.size).toBe(Object.keys(SERVICES).length)
    })

    it('should include all service IDs in health map', async () => {
      const healthMap = await serviceManager.healthCheckAll()

      for (const serviceId of Object.keys(SERVICES)) {
        expect(healthMap.has(serviceId)).toBe(true)
      }
    })
  })

  describe('getUptime', () => {
    it('should return null for non-running service', async () => {
      const uptime = await serviceManager.getUptime('redis')
      expect(uptime).toBeNull()
    })

    it('should return null for unknown service', async () => {
      const uptime = await serviceManager.getUptime('nonexistent-service')
      expect(uptime).toBeNull()
    })
  })

  describe('ServiceConfig validation', () => {
    it('should have valid docker service configuration', () => {
      const redis = SERVICES.redis
      expect(redis.type).toBe('docker')
      expect(redis.container).toBe('bernard-redis')
      expect(redis.image).toBe('redis/redis-stack-server:7.4.0-v0')
      expect(redis.dependencies).toEqual([])
    })

    it('should have valid node service configuration', () => {
      const core = SERVICES['core']
      expect(core.type).toBe('node')
      expect(core.directory).toBe('core')
      expect(core.script).toBeDefined()
      expect(core.healthPath).toBe('/api/health')
    })

    it('should have valid cpp service configuration', () => {
      const whisper = SERVICES.whisper
      expect(whisper.type).toBe('cpp')
      expect(whisper.directory).toBe('services/whisper.cpp')
      expect(whisper.script).toContain('whisper-server')
    })
  })
})
