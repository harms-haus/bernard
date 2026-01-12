import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { LogStreamer } from '@/lib/services/LogStreamer'
import { SERVICES } from '@/lib/services/ServiceConfig'

describe('Integration: Log Streaming', () => {
  let logStreamer: LogStreamer
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
    logStreamer = new LogStreamer()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Log File Management', () => {
    it('should return correct log path for each service', () => {
      for (const [serviceId, config] of Object.entries(SERVICES)) {
        const logPath = logStreamer.getLogPath(serviceId)
        expect(logPath).toContain(`${serviceId}.log`)
        expect(logPath).toContain(LOGS_DIR)
      }
    })

    it('should handle service ID normalization', () => {
      const logPath1 = logStreamer.getLogPath('bernard_ui')
      const logPath2 = logStreamer.getLogPath('BERNARD-UI')
      const logPath3 = logStreamer.getLogPath('bernard-ui')

      expect(logPath1).toBe(logPath2)
      expect(logPath1).toBe(logPath3)
    })
  })

  describe('Log Parsing', () => {
    it('should parse JSON log entries correctly', () => {
      const jsonLog = JSON.stringify({
        time: '2024-01-15T10:30:00.000Z',
        level: 'info',
        service: 'test-service',
        msg: 'Test message',
        extraField: 'should be preserved'
      })

      const entry = logStreamer.parseLogLine(jsonLog)

      expect(entry.timestamp).toBe('2024-01-15T10:30:00.000Z')
      expect(entry.level).toBe('info')
      expect(entry.service).toBe('test-service')
      expect(entry.message).toBe('Test message')
      expect((entry as any).extraField).toBe('should be preserved')
    })

    it('should handle various log levels', () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

      for (const level of levels) {
        const jsonLog = JSON.stringify({
          time: '2024-01-15T10:30:00.000Z',
          level,
          service: 'test',
          msg: `Test ${level}`
        })

        const entry = logStreamer.parseLogLine(jsonLog)
        expect(entry.level).toBe(level)
      }
    })

    it('should handle plain text logs', () => {
      const plainLog = '2024-01-15 10:30:00 INFO This is a plain text log'

      const entry = logStreamer.parseLogLine(plainLog)

      expect(entry.message).toBe(plainLog)
      expect(entry.timestamp).toBeDefined()
      expect(entry.level).toBe('info')
    })

    it('should detect error levels in plain text logs', () => {
      const errorLog = '2024-01-15 10:30:00 ERROR Something failed here'

      const entry = logStreamer.parseLogLine(errorLog)

      expect(entry.level).toBe('error')
      expect(entry.message).toContain('Something failed here')
    })

    it('should throw for empty lines', () => {
      expect(() => logStreamer.parseLogLine('')).toThrow()
      expect(() => logStreamer.parseLogLine('   ')).toThrow()
    })
  })

  describe('Log Redaction', () => {
    it('should redact all sensitive fields', () => {
      const entry: any = {
        timestamp: '2024-01-15T10:30:00.000Z',
        level: 'info',
        service: 'test',
        message: 'test',
        raw: 'test',
        apiKey: 'secret-key-12345',
        accessToken: 'token-xyz',
        refreshToken: 'refresh-abc',
        password: 'my-password',
        secret: 'very-secret',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----'
      }

      const redacted = logStreamer.redactSensitiveFields(entry)

      expect(redacted.apiKey).toBe('[REDACTED]')
      expect(redacted.accessToken).toBe('[REDACTED]')
      expect(redacted.refreshToken).toBe('[REDACTED]')
      expect(redacted.password).toBe('[REDACTED]')
      expect(redacted.secret).toBe('[REDACTED]')
      expect(redacted.privateKey).toBe('[REDACTED]')
    })

    it('should preserve non-sensitive fields', () => {
      const entry: any = {
        timestamp: '2024-01-15T10:30:00.000Z',
        level: 'info',
        service: 'test',
        message: 'test',
        raw: 'test',
        userId: 'user-123',
        event: 'login_attempt',
        statusCode: 200,
        path: '/api/test'
      }

      const redacted = logStreamer.redactSensitiveFields(entry)

      expect(redacted.userId).toBe('user-123')
      expect(redacted.event).toBe('login_attempt')
      expect(redacted.statusCode).toBe(200)
      expect(redacted.path).toBe('/api/test')
    })

    it('should be case-insensitive for field names', () => {
      const entry: any = {
        timestamp: '2024-01-15T10:30:00.000Z',
        level: 'info',
        service: 'test',
        message: 'test',
        raw: 'test',
        APIKEY: 'secret',
        TOKEN: 'bearer',
        PASSWORD: 'secret'
      }

      const redacted = logStreamer.redactSensitiveFields(entry)

      expect(redacted.APIKEY).toBe('[REDACTED]')
      expect(redacted.TOKEN).toBe('[REDACTED]')
      expect(redacted.PASSWORD).toBe('[REDACTED]')
    })
  })

  describe('Log Tailing', () => {
    it('should return empty array for non-existent log', async () => {
      const logs = await logStreamer.tailLog('nonexistent-service', 100)
      expect(logs).toEqual([])
    })

    it('should return last N lines', async () => {
      const logPath = logStreamer.getLogPath('test-service')
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}`)
      fs.writeFileSync(logPath, lines.join('\n'))

      const logs = await logStreamer.tailLog('test-service', 5)

      expect(logs).toHaveLength(5)
    })

    it('should return all lines if less than requested', async () => {
      const logPath = logStreamer.getLogPath('test-service')
      fs.writeFileSync(logPath, 'Line 1\nLine 2\nLine 3')

      const logs = await logStreamer.tailLog('test-service', 100)

      expect(logs).toHaveLength(3)
    })

    it('should handle empty log file', async () => {
      const logPath = logStreamer.getLogPath('test-service')
      fs.writeFileSync(logPath, '')

      const logs = await logStreamer.tailLog('test-service', 100)

      expect(logs).toEqual([])
    })

    it('should parse and redact log entries', async () => {
      const logPath = logStreamer.getLogPath('test-service')
      const jsonLog = JSON.stringify({
        time: '2024-01-15T10:30:00.000Z',
        level: 'info',
        service: 'test',
        msg: 'test',
        apiKey: 'secret'
      })
      fs.writeFileSync(logPath, jsonLog)

      const logs = await logStreamer.tailLog('test-service', 10)

      expect(logs).toHaveLength(1)
      expect((logs[0] as any).apiKey).toBe('[REDACTED]')
    })
  })

  describe('Service Log Configuration', () => {
    it('should have log color for each service', () => {
      const colors = new Set<string>()

      for (const [serviceId, config] of Object.entries(SERVICES)) {
        expect(config.color).toBeDefined()
        expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
        colors.add(config.color)
      }

      expect(colors.size).toBe(Object.keys(SERVICES).length)
    })
  })
})
