import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Create mock store object that tests can reference
const mockStore = {
  getServices: vi.fn(),
}

// Mock Redis
const mockRedis = {}

describe('POST /api/admin/services/test/home-assistant', () => {
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

  describe('Configuration', () => {
    it('should require baseUrl', async () => {
      mockStore.getServices.mockResolvedValue({ homeAssistant: { accessToken: 'token-123' } })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.errorType).toBe('configuration')
    })

    it('should require accessToken', async () => {
      mockStore.getServices.mockResolvedValue({ homeAssistant: { baseUrl: 'http://ha:8123' } })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.errorType).toBe('configuration')
    })
  })

  describe('Authentication', () => {
    it('should use Bearer token in Authorization header', async () => {
      mockStore.getServices.mockResolvedValue({
        homeAssistant: { baseUrl: 'http://ha:8123', accessToken: 'token-123' },
      })

      ; (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://ha:8123/api/',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer token-123',
          }),
        })
      )
    })
  })

  describe('Connection Tests', () => {
    it('should return success on valid connection', async () => {
      mockStore.getServices.mockResolvedValue({
        homeAssistant: { baseUrl: 'http://ha:8123', accessToken: 'token-123' },
      })

      ; (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.status).toBe('success')
    })

    it('should detect invalid token', async () => {
      mockStore.getServices.mockResolvedValue({
        homeAssistant: { baseUrl: 'http://ha:8123', accessToken: 'token-123' },
      })

      ; (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      const data = await response.json()
      expect(data.errorType).toBe('server_error')
    })

    it('should handle connection errors', async () => {
      mockStore.getServices.mockResolvedValue({
        homeAssistant: { baseUrl: 'http://ha:8123', accessToken: 'token-123' },
      })

      ; (global.fetch as any).mockRejectedValue(new Error('Connection refused'))

      const request = {} as import('next/server').NextRequest
      const response = await POST(request)

      const data = await response.json()
      expect(data.errorType).toBe('connection')
    })
  })
})
