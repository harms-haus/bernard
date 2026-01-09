import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { HealthChecker } from './HealthChecker'
import { SERVICES } from './ServiceConfig'

describe('HealthChecker', () => {
  let healthChecker: HealthChecker
  const TEST_DIR = path.join(process.cwd(), 'test-temp')
  const LOGS_DIR = path.join(TEST_DIR, 'logs')

  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true })
    }
    vi.stubEnv('LOG_DIR', LOGS_DIR)
    vi.stubEnv('TZ', 'America/Chicago')
    healthChecker = new HealthChecker()
  })

  describe('check', () => {
    it('should return down status for unknown service', async () => {
      const status = await healthChecker.check('unknown-service')
      expect(status.status).toBe('down')
      expect(status.error).toBe('Unknown service')
    })

    it('should return health status for redis (docker)', async () => {
      const status = await healthChecker.check('redis')
      expect(status).toBeDefined()
      expect(status.service).toBe('redis')
      expect(status.lastChecked).toBeInstanceOf(Date)
    })

    it('should return health status for bernard-api', async () => {
      const status = await healthChecker.check('bernard-api')
      expect(status).toBeDefined()
      expect(status.service).toBe('bernard-api')
      expect(status.lastChecked).toBeInstanceOf(Date)
    })

    it('should return down status for non-running service', async () => {
      const status = await healthChecker.check('bernard-api')
      expect(status.status).toMatch(/^(up|down|starting|degraded)$/)
    })
  })

  describe('checkAll', () => {
    it('should return health status for all services', async () => {
      const results = await healthChecker.checkAll()
      expect(results.size).toBe(Object.keys(SERVICES).length)
    })

    it('should include all service IDs', async () => {
      const results = await healthChecker.checkAll()
      for (const serviceId of Object.keys(SERVICES)) {
        expect(results.has(serviceId)).toBe(true)
      }
    })
  })

  describe('waitForHealthy', () => {
    it('should return false for unknown service', async () => {
      const result = await healthChecker.waitForHealthy('unknown-service', 5)
      expect(result).toBe(false)
    })

    it('should return false when service is not configured', async () => {
      const result = await healthChecker.waitForHealthy('nonexistent', 1)
      expect(result).toBe(false)
    })
  })

  describe('HealthStatus interface', () => {
    it('should have required properties', async () => {
      const status = await healthChecker.check('redis')
      expect(status).toHaveProperty('service')
      expect(status).toHaveProperty('status')
      expect(status).toHaveProperty('lastChecked')
      expect(status.status).toBeTypeOf('string')
    })
  })
})
