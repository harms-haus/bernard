import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Shared mock store reference
const mockStore = {
  getServices: vi.fn(),
}

const mockRedis = {}

describe('POST /api/admin/services/test/plex', () => {
  let POST: (request: import('next/server').NextRequest) => Promise<import('next/server').NextResponse>
  let helpersModule: typeof import('@/lib/auth/server-helpers')
  let originalFetch: typeof global.fetch

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.resetAllMocks()

    // Setup mocks BEFORE importing the route
    vi.doMock('@/lib/config/settingsStore', () => ({
      initializeSettingsStore: vi.fn().mockResolvedValue({}),
      getSettingsStore: vi.fn().mockReturnValue(mockStore),
      resetSettingsStore: vi.fn(),
    }))

    vi.doMock('@/lib/infra/redis', () => ({
      getRedis: vi.fn().mockReturnValue(mockRedis),
    }))

    // Mock global fetch
    originalFetch = global.fetch
    global.fetch = vi.fn()

    // Import the route module fresh with mocks in place
    helpersModule = await import('@/lib/auth/server-helpers')

    const routeModule = await import('./route')
    POST = routeModule.POST

    // Setup requireAdmin mock
    vi.spyOn(helpersModule, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.fetch = originalFetch
  })

  describe('Configuration Validation', () => {
    it('should require baseUrl', async () => {
      mockStore.getServices.mockResolvedValue({ plex: { token: 'test-token' } })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.errorType).toBe('configuration')
    })

    it('should require token', async () => {
      mockStore.getServices.mockResolvedValue({ plex: { baseUrl: 'http://plex:32400' } })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.errorType).toBe('configuration')
    })
  })

  describe('Connection Tests', () => {
    it('should return success with machineIdentifier', async () => {
      mockStore.getServices.mockResolvedValue({
        plex: { baseUrl: 'http://plex:32400', token: 'test-token' },
      })

      ; (global.fetch as any).mockResolvedValue({
        ok: true,
        text: async () => '<MediaContainer machineIdentifier="abc123"/>',
      })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.status).toBe('success')
      expect(data.machineIdentifier).toBe('abc123')
    })

    it('should handle 401 unauthorized', async () => {
      mockStore.getServices.mockResolvedValue({
        plex: { baseUrl: 'http://plex:32400', token: 'test-token' },
      })

      ; (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      const data = await response.json()
      expect(data.status).toBe('failed')
    })

    it('should handle connection errors', async () => {
      mockStore.getServices.mockResolvedValue({
        plex: { baseUrl: 'http://plex:32400', token: 'test-token' },
      })

      ; (global.fetch as any).mockRejectedValue(new Error('Connection refused'))

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      const data = await response.json()
      expect(data.errorType).toBe('connection')
    })
  })
})
