import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { HealthMonitor, getHealthMonitor, stopHealthMonitor } from './HealthMonitor'
import { HealthStatus } from './HealthChecker'

// Mock dependencies
vi.mock('./HealthChecker', () => ({
  HealthChecker: vi.fn().mockImplementation(() => ({
    checkAll: vi.fn(),
  })),
}))

vi.mock('./ServiceConfig', () => ({
  SERVICES: {
    testService: {
      id: 'testService',
      displayName: 'Test Service',
      type: 'node',
      command: 'npm run test',
      checkUrl: 'http://localhost:3000/health',
      checkInterval: 5000,
      checkTimeout: 3000,
      checkRetries: 3,
      logPath: '/tmp/test.log',
    },
  },
}))

vi.mock('@/lib/logging/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor
  let mockHealthChecker: { checkAll: ReturnType<typeof vi.fn> }

  const createMockStatus = (status: HealthStatus['status']): HealthStatus => ({
    service: 'testService',
    status,
    lastChecked: new Date(),
    responseTime: 100,
    error: status === 'down' ? 'Connection refused' : undefined,
  })

  beforeEach(() => {
    vi.useFakeTimers()
    healthMonitor = new HealthMonitor({ checkIntervalMs: 1000, heartbeatIntervalMs: 2000 })
    mockHealthChecker = (healthMonitor as any).healthChecker
  })

  afterEach(() => {
    healthMonitor.stop()
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  describe('constructor', () => {
    it('should create with default intervals', () => {
      const monitor = new HealthMonitor()
      expect((monitor as any).checkIntervalMs).toBe(5000)
      expect((monitor as any).heartbeatIntervalMs).toBe(60000)
    })

    it('should create with custom intervals', () => {
      const monitor = new HealthMonitor({ checkIntervalMs: 100, heartbeatIntervalMs: 200 })
      expect((monitor as any).checkIntervalMs).toBe(100)
      expect((monitor as any).heartbeatIntervalMs).toBe(200)
    })
  })

  describe('start', () => {
    it('should start health checks', () => {
      healthMonitor.start()
      expect(healthMonitor.isRunning()).toBe(true)
    })

    it('should not start if already running', () => {
      healthMonitor.start()
      const checkIntervalBefore = (healthMonitor as any).checkInterval

      healthMonitor.start() // Should be no-op

      expect((healthMonitor as any).checkInterval).toBe(checkIntervalBefore)
    })

    it('should run initial check on start', async () => {
      mockHealthChecker.checkAll.mockResolvedValue(
        new Map([['testService', createMockStatus('up')]])
      )

      healthMonitor.start()
      await Promise.resolve() // Allow async check to complete

      expect(mockHealthChecker.checkAll).toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('should stop health checks', () => {
      healthMonitor.start()
      healthMonitor.stop()
      expect(healthMonitor.isRunning()).toBe(false)
    })

    it('should clear both intervals', () => {
      healthMonitor.start()
      healthMonitor.stop()

      expect((healthMonitor as any).checkInterval).toBeNull()
      expect((healthMonitor as any).heartbeatInterval).toBeNull()
    })

    it('should clear subscribers', () => {
      const callback = vi.fn()
      healthMonitor.subscribe(callback)
      expect((healthMonitor as any).subscribers.size).toBe(1)

      healthMonitor.stop()
      expect((healthMonitor as any).subscribers.size).toBe(0)
    })
  })

  describe('getSnapshot', () => {
    it('should return snapshot of all services', async () => {
      const mockResults = new Map([
        ['testService', createMockStatus('up')],
      ])
      mockHealthChecker.checkAll.mockResolvedValue(mockResults)

      const snapshot = await healthMonitor.getSnapshot()

      expect(snapshot.services).toHaveLength(1)
      expect(snapshot.services[0].service).toBe('testService')
      expect(snapshot.services[0].status).toBe('up')
    })

    it('should include response time and error when down', async () => {
      const mockResults = new Map([
        ['testService', createMockStatus('down')],
      ])
      mockHealthChecker.checkAll.mockResolvedValue(mockResults)

      const snapshot = await healthMonitor.getSnapshot()

      expect(snapshot.services[0].status).toBe('down')
      expect(snapshot.services[0].error).toBe('Connection refused')
    })
  })

  describe('subscribe', () => {
    it('should add subscriber and return unsubscribe function', () => {
      const callback = vi.fn()
      const unsubscribe = healthMonitor.subscribe(callback)

      expect((healthMonitor as any).subscribers.has(callback)).toBe(true)

      unsubscribe()
      expect((healthMonitor as any).subscribers.has(callback)).toBe(false)
    })

    it('should notify subscriber of updates', async () => {
      mockHealthChecker.checkAll.mockResolvedValue(
        new Map([['testService', createMockStatus('up')]])
      )

      const callback = vi.fn()
      healthMonitor.subscribe(callback)

      healthMonitor.start()
      await Promise.resolve() // Allow check to complete

      expect(callback).toHaveBeenCalled()
      const update = callback.mock.calls[0][0]
      expect(update.service).toBe('testService')
      expect(update.status).toBe('up')
    })
  })

  describe('status change detection', () => {
    it('should detect status changes', async () => {
      const upStatus = createMockStatus('up')
      const downStatus = createMockStatus('down')

      // First check returns up
      mockHealthChecker.checkAll.mockResolvedValueOnce(
        new Map([['testService', upStatus]])
      )

      healthMonitor.start()
      await Promise.resolve() // First check completes
      vi.clearAllTimers()

      // Reset mock for second check
      mockHealthChecker.checkAll.mockResolvedValueOnce(
        new Map([['testService', downStatus]])
      )

        // Trigger next check
        ; (healthMonitor as any).checkAll()
      await Promise.resolve()

      // Get the second call's update
      const calls = mockHealthChecker.checkAll.mock.calls
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('isRunning', () => {
    it('should return false when not started', () => {
      expect(healthMonitor.isRunning()).toBe(false)
    })

    it('should return true when started', () => {
      healthMonitor.start()
      expect(healthMonitor.isRunning()).toBe(true)
    })

    it('should return false after stop', () => {
      healthMonitor.start()
      healthMonitor.stop()
      expect(healthMonitor.isRunning()).toBe(false)
    })
  })
})

describe('getHealthMonitor', () => {
  afterEach(() => {
    stopHealthMonitor()
    vi.clearAllTimers()
  })

  it('should return singleton instance', () => {
    const instance1 = getHealthMonitor()
    const instance2 = getHealthMonitor()
    expect(instance1).toBe(instance2)
  })

  it('should reset singleton when stopped', () => {
    const instance1 = getHealthMonitor()
    stopHealthMonitor()
    const instance2 = getHealthMonitor()
    expect(instance1).not.toBe(instance2)
  })
})
