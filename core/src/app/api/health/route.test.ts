import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleHealthCheck } from '@/lib/api/health'

// Mock the factory module - this needs to happen before importing the handler
vi.mock('../../../lib/api/factory', () => ({
  getHealthChecker: vi.fn(),
}))

// Re-import to get the mocked version
const { getHealthChecker }: any = await import('../../../lib/api/factory')

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = (url: string) =>
    ({
      nextUrl: {
        searchParams: new URL(url).searchParams,
      },
    } as unknown as import('next/server').NextRequest)

  describe('handleHealthCheck', () => {
    it('should return health status for all services', async () => {
      const mockHealthMap = new Map([
        ['redis', { service: 'redis', status: 'up' as const, lastChecked: new Date() }],
        ['bernard-agent', { service: 'bernard-agent', status: 'up' as const, lastChecked: new Date() }],
      ])

      const mockChecker = {
        checkAll: vi.fn().mockResolvedValue(mockHealthMap),
      }
      getHealthChecker.mockReturnValue(mockChecker)

      const request = createMockRequest('http://localhost/api/health')
      const result = await handleHealthCheck(request)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.services).toHaveLength(2)
      expect(data.data.timestamp).toBeDefined()
    })

    it('should return health status for specific service', async () => {
      const mockHealth = {
        service: 'redis',
        status: 'up' as const,
        lastChecked: new Date('2024-01-01T00:00:00Z'),
        responseTime: 5,
      }

      const mockChecker = {
        check: vi.fn().mockResolvedValue(mockHealth),
      }
      getHealthChecker.mockReturnValue(mockChecker)

      const request = createMockRequest('http://localhost/api/health?service=redis')
      const result = await handleHealthCheck(request)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.service).toBe('redis')
      expect(data.data.status).toBe('up')
      expect(mockChecker.check).toHaveBeenCalledWith('redis')
    })

    it('should include error in response when service is down', async () => {
      const mockHealth = {
        service: 'unknown-service',
        status: 'down' as const,
        lastChecked: new Date(),
        error: 'Unknown service',
      }

      const mockChecker = {
        check: vi.fn().mockResolvedValue(mockHealth),
      }
      getHealthChecker.mockReturnValue(mockChecker)

      const request = createMockRequest('http://localhost/api/health?service=unknown-service')
      const result = await handleHealthCheck(request)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.data.status).toBe('down')
      expect(data.data.error).toBe('Unknown service')
    })

    it('should return 500 when checkAll throws', async () => {
      const mockChecker = {
        checkAll: vi.fn().mockRejectedValue(new Error('Health check failed')),
      }
      getHealthChecker.mockReturnValue(mockChecker)

      const request = createMockRequest('http://localhost/api/health')
      const result = await handleHealthCheck(request)

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Internal server error')
    })

    it('should return 500 when check throws', async () => {
      const mockChecker = {
        check: vi.fn().mockRejectedValue(new Error('Service check failed')),
      }
      getHealthChecker.mockReturnValue(mockChecker)

      const request = createMockRequest('http://localhost/api/health?service=redis')
      const result = await handleHealthCheck(request)

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.success).toBe(false)
    })

    it('should handle non-Error exceptions', async () => {
      const mockChecker = {
        checkAll: vi.fn().mockRejectedValue('string error'),
      }
      getHealthChecker.mockReturnValue(mockChecker)

      const request = createMockRequest('http://localhost/api/health')
      const result = await handleHealthCheck(request)

      expect(result.status).toBe(500)
    })
  })
})
