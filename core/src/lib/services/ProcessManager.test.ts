import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ProcessManager } from './ProcessManager'
import { SERVICES } from './ServiceConfig'

describe('ProcessManager', () => {
  let processManager: ProcessManager
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
    processManager = new ProcessManager()
  })

  describe('getPid', () => {
    it('should return null for service without pid file', async () => {
      const pid = await processManager.getPid(SERVICES['core'])
      expect(pid).toBeNull()
    })
  })

  describe('isRunning', () => {
    it('should return false for non-running service', async () => {
      const isRunning = await processManager.isRunning(SERVICES['core'])
      expect(isRunning).toBe(false)
    })
  })

  describe('start', () => {
    it('should fail for service without script', async () => {
      const result = await processManager.start(SERVICES.redis)
      expect(result.success).toBe(false)
      expect(result.error).toContain('No script')
    })

    it('should fail for service with docker type', async () => {
      const result = await processManager.start(SERVICES.redis)
      expect(result.success).toBe(false)
    })
  })

  describe('stop', () => {
    it('should return true for non-running service', async () => {
      const result = await processManager.stop(SERVICES['core'])
      expect(result).toBe(true)
    })
  })

  describe('killByPid', () => {
    it('should not throw for non-running pid', async () => {
      await expect(processManager.killByPid(999999, true)).resolves.not.toThrow()
    })

    it('should not throw for graceful=false with non-running pid', async () => {
      await expect(processManager.killByPid(999999, false)).resolves.not.toThrow()
    })
  })
})
