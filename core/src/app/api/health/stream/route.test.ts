import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/services/HealthMonitor', () => ({
  getHealthMonitor: vi.fn(),
}))

vi.mock('@/lib/logging/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

const { getHealthMonitor }: any = await import('@/lib/services/HealthMonitor')
const { logger }: any = await import('@/lib/logging/logger')

describe('GET /api/health/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = () =>
    ({
      url: 'http://localhost/api/health/stream',
      headers: new Headers(),
      signal: {
        addEventListener: vi.fn(),
      },
    }) as unknown as import('next/server').NextRequest

  it('should return SSE stream with health updates', async () => {
    const mockMonitor = {
      isRunning: vi.fn().mockReturnValue(true),
      start: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        services: [
          { id: 'redis', name: 'REDIS', status: 'up' as const, color: 'green', isChange: false },
          { id: 'core', name: 'CORE', status: 'up' as const, color: 'green', isChange: false },
        ],
        timestamp: new Date().toISOString(),
      }),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    }
    getHealthMonitor.mockReturnValue(mockMonitor)

    const request = createMockRequest()
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate')
    expect(response.headers.get('X-Accel-Buffering')).toBe('no')
  })

  it('should start monitor if not running', async () => {
    const mockMonitor = {
      isRunning: vi.fn().mockReturnValue(false),
      start: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        services: [],
        timestamp: new Date().toISOString(),
      }),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    }
    getHealthMonitor.mockReturnValue(mockMonitor)

    const request = createMockRequest()
    await GET(request)

    expect(mockMonitor.start).toHaveBeenCalled()
  })

  it('should send initial snapshot as SSE events', async () => {
    const mockMonitor = {
      isRunning: vi.fn().mockReturnValue(true),
      start: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        services: [
          { id: 'redis', name: 'REDIS', status: 'up' as const, color: 'green', isChange: false },
        ],
        timestamp: new Date().toISOString(),
      }),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    }
    getHealthMonitor.mockReturnValue(mockMonitor)

    const request = createMockRequest()
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mockMonitor.getSnapshot).toHaveBeenCalled()
    expect(mockMonitor.subscribe).toHaveBeenCalled()
  })

  it('should subscribe to real-time updates', async () => {
    const mockMonitor = {
      isRunning: vi.fn().mockReturnValue(true),
      start: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        services: [],
        timestamp: new Date().toISOString(),
      }),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    }
    getHealthMonitor.mockReturnValue(mockMonitor)

    const request = createMockRequest()
    await GET(request)

    expect(mockMonitor.subscribe).toHaveBeenCalled()
  })

  it('should add abort listener to request signal', async () => {
    const mockMonitor = {
      isRunning: vi.fn().mockReturnValue(true),
      start: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue({
        services: [],
        timestamp: new Date().toISOString(),
      }),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    }
    getHealthMonitor.mockReturnValue(mockMonitor)

    const request = createMockRequest()
    await GET(request)

    expect(request.signal.addEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
