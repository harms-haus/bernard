import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Shared mock store reference
const mockStore = {
  getServices: vi.fn(),
}

const mockRedis = {}

describe('POST /api/admin/services/test/overseerr', () => {
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
    vi.restoreAllMocks?.()
    global.fetch = originalFetch
  })

  describe('Configuration Validation', () => {
    it('should return errorType configuration when config missing', async () => {
      mockStore.getServices.mockResolvedValue({})

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.status).toBe('failed')
      expect(data.errorType).toBe('configuration')
    })

    it('should return error when baseUrl missing', async () => {
      mockStore.getServices.mockResolvedValue({ overseerr: { apiKey: 'test-key' } })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      const data = await response.json()
      expect(data.errorType).toBe('configuration')
    })

    it('should return error when apiKey missing', async () => {
      mockStore.getServices.mockResolvedValue({ overseerr: { baseUrl: 'http://overseerr:5055' } })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      const data = await response.json()
      expect(data.errorType).toBe('configuration')
    })
  })

  describe('Authentication', () => {
    it('should return 403 for unauthenticated request', async () => {
      vi.spyOn(helpersModule, 'requireAdmin').mockResolvedValue(null)

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(403)
    })
  })

  describe('Connection Tests', () => {
    it('should return success when Overseerr is reachable', async () => {
      mockStore.getServices.mockResolvedValue({
        overseerr: { baseUrl: 'http://overseerr:5055', apiKey: 'test-key' },
      })

      ; (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.status).toBe('success')
      expect(data.testedAt).toBeDefined()
    })

    it('should detect unauthorized errors', async () => {
      mockStore.getServices.mockResolvedValue({
        overseerr: { baseUrl: 'http://overseerr:5055', apiKey: 'test-key' },
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
      expect(data.errorType).toBe('unauthorized')
    })

    it('should detect server errors', async () => {
      mockStore.getServices.mockResolvedValue({
        overseerr: { baseUrl: 'http://overseerr:5055', apiKey: 'test-key' },
      })

      ; (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      const data = await response.json()
      expect(data.errorType).toBe('server_error')
    })

    it('should timeout after 10 seconds', async () => {
      mockStore.getServices.mockResolvedValue({
        overseerr: { baseUrl: 'http://overseerr:5055', apiKey: 'test-key' },
      })

      ; (global.fetch as any).mockImplementation(async (_url: string, options: any) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted')
              error.name = 'AbortError'
              reject(error)
            })
          }
        })
      })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      const data = await response.json()
      expect(data.errorType).toBe('timeout')
    })

    it('should detect connection refused', async () => {
      mockStore.getServices.mockResolvedValue({
        overseerr: { baseUrl: 'http://overseerr:5055', apiKey: 'test-key' },
      })

      ; (global.fetch as any).mockRejectedValue(new Error('Connection refused'))

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      const data = await response.json()
      expect(data.errorType).toBe('connection')
    })
  })
})
