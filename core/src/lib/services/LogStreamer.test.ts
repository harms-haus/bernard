import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { LogStreamer, ParsedLogEntry } from './LogStreamer'

describe('LogStreamer', () => {
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

  describe('getLogPath', () => {
    it('should return correct path for service', () => {
      const logPath = logStreamer.getLogPath('redis')
      expect(logPath).toContain('redis.log')
      expect(logPath).toContain(LOGS_DIR)
    })

    it('should handle uppercase service names', () => {
      const path = logStreamer.getLogPath('REDIS')
      expect(path).toContain('redis.log')
    })

    it('should handle underscores', () => {
      const path = logStreamer.getLogPath('bernard_api')
      expect(path).toContain('bernard-api.log')
    })
  })

  describe('logExists', () => {
    it('should return false for non-existent log', async () => {
      const exists = await logStreamer.logExists('nonexistent-service')
      expect(exists).toBe(false)
    })

    it('should return true for existing log', async () => {
      const logPath = logStreamer.getLogPath('test-service')
      fs.writeFileSync(logPath, 'test content')

      const exists = await logStreamer.logExists('test-service')
      expect(exists).toBe(true)
    })
  })

  describe('parseLogLine', () => {
    it('should parse JSON log entry', () => {
      const jsonLine = JSON.stringify({
        time: '2024-01-01T12:00:00Z',
        level: 'info',
        service: 'test',
        msg: 'test message'
      })
      const entry = logStreamer.parseLogLine(jsonLine)

      expect(entry.timestamp).toBe('2024-01-01T12:00:00Z')
      expect(entry.level).toBe('info')
      expect(entry.service).toBe('test')
      expect(entry.message).toBe('test message')
      expect(entry.raw).toBe(jsonLine)
    })

    it('should handle non-JSON log entry', () => {
      const plainLine = '2024-01-01 12:00:00 INFO Some message'
      const entry = logStreamer.parseLogLine(plainLine)

      expect(entry.timestamp).toBeDefined()
      expect(entry.message).toBe(plainLine)
    })

    it('should handle empty line', () => {
      expect(() => logStreamer.parseLogLine('')).toThrow()
    })

    it('should handle whitespace-only line', () => {
      expect(() => logStreamer.parseLogLine('   ')).toThrow()
    })

    it('should extract ERROR level from text', () => {
      const line = '2024-01-01T12:00:00Z ERROR Something went wrong'
      const entry = logStreamer.parseLogLine(line)
      expect(entry.level).toBe('error')
    })

    it('should default to info level', () => {
      const line = '2024-01-01T12:00:00Z Plain message without level'
      const entry = logStreamer.parseLogLine(line)
      expect(entry.level).toBe('info')
    })
  })

  describe('redactSensitiveFields', () => {
    it('should redact apiKey field', () => {
      const entry: ParsedLogEntry = {
        timestamp: '2024-01-01T12:00:00Z',
        level: 'info',
        service: 'test',
        message: 'test',
        raw: 'test',
        apiKey: 'secret-key-12345'
      }
      const redacted = logStreamer.redactSensitiveFields(entry)
      expect(redacted.apiKey).toBe('[REDACTED]')
    })

    it('should redact token field', () => {
      const entry: ParsedLogEntry = {
        timestamp: '2024-01-01T12:00:00Z',
        level: 'info',
        service: 'test',
        message: 'test',
        raw: 'test',
        token: 'bearer-token-xyz'
      }
      const redacted = logStreamer.redactSensitiveFields(entry)
      expect(redacted.token).toBe('[REDACTED]')
    })

    it('should redact password field', () => {
      const entry: ParsedLogEntry = {
        timestamp: '2024-01-01T12:00:00Z',
        level: 'info',
        service: 'test',
        message: 'test',
        raw: 'test',
        password: 'my-secret-password'
      }
      const redacted = logStreamer.redactSensitiveFields(entry)
      expect(redacted.password).toBe('[REDACTED]')
    })

    it('should not modify non-sensitive fields', () => {
      const entry: ParsedLogEntry = {
        timestamp: '2024-01-01T12:00:00Z',
        level: 'info',
        service: 'test',
        message: 'test',
        raw: 'test',
        userId: 'user-123',
        event: 'login_attempt'
      }
      const redacted = logStreamer.redactSensitiveFields(entry)
      expect(redacted.userId).toBe('user-123')
      expect(redacted.event).toBe('login_attempt')
    })

    it('should be case-insensitive for field names', () => {
      const entry: ParsedLogEntry = {
        timestamp: '2024-01-01T12:00:00Z',
        level: 'info',
        service: 'test',
        message: 'test',
        raw: 'test',
        APIKEY: 'secret',
        Token: 'bearer'
      }
      const redacted = logStreamer.redactSensitiveFields(entry)
      expect(redacted.APIKEY).toBe('[REDACTED]')
      expect(redacted.Token).toBe('[REDACTED]')
    })
  })

  describe('tailLog', () => {
    it('should return empty array for non-existent log', async () => {
      const logs = await logStreamer.tailLog('nonexistent-service', 100)
      expect(logs).toEqual([])
    })

    it('should return last N lines', async () => {
      const logPath = logStreamer.getLogPath('test-service')
      const lines = Array.from({ length: 10 }, (_, i) => `Line ${i}`)
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

    it('should parse and redact log entries', async () => {
      const logPath = logStreamer.getLogPath('test-service')
      const jsonLog = JSON.stringify({
        time: '2024-01-01T12:00:00Z',
        level: 'info',
        service: 'test',
        msg: 'test',
        apiKey: 'secret'
      })
      fs.writeFileSync(logPath, jsonLog)

      const logs = await logStreamer.tailLog('test-service', 10)
      expect(logs).toHaveLength(1)
      expect(logs[0].apiKey).toBe('[REDACTED]')
    })
  })

  describe('unwatchLog', () => {
    it('should not throw for non-watching service', async () => {
      await expect(logStreamer.unwatchLog('nonexistent-service')).resolves.not.toThrow()
    })
  })

  describe('stopAll', () => {
    it('should not throw when no streams active', async () => {
      await expect(logStreamer.stopAll()).resolves.not.toThrow()
    })
  })
})
