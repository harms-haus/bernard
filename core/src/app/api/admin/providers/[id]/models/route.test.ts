import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getSettingsStore } from '@/lib/config/settingsStore'

// Mock settingsStore - use vi.fn() directly in factory
vi.mock('@/lib/config/settingsStore', () => ({
  initializeSettingsStore: vi.fn().mockResolvedValue({}),
  getSettingsStore: vi.fn().mockReturnValue({
    getProviders: vi.fn(),
  }),
  resetSettingsStore: vi.fn(),
}))

// Mock Redis
vi.mock('@/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue({}),
}))

// Mock global fetch
global.fetch = vi.fn()

describe('GET /api/admin/providers/[id]/models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 404 if provider not found', async () => {
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([]),
    })

    const params = Promise.resolve({ id: 'non-existent' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })
    expect(response.status).toBe(404)
  })

  it('should return 403 for unauthenticated', async () => {
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue(null)

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })
    expect(response.status).toBe(403)
  })

  it('should proxy request to provider baseUrl', async () => {
    const mockProvider = { id: '1', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-123' }
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([mockProvider]),
    })

    const mockModels = { data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }] }
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockModels,
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toHaveLength(2)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-123',
        }),
      })
    )
  })

  it('should handle /v1 suffix in baseUrl', async () => {
    const mockProvider = { id: '1', baseUrl: 'https://api.openai.com', apiKey: 'sk-123' }
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([mockProvider]),
    })

    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.any(Object)
    )
  })

  it('should return 502 on provider API error', async () => {
    const mockProvider = { id: '1', baseUrl: 'https://api.openai.com', apiKey: 'sk-123' }
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([mockProvider]),
    })

    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error message',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })
    expect(response.status).toBe(502)
  })

  it('should return 502 on connection error', async () => {
    const mockProvider = { id: '1', baseUrl: 'https://api.openai.com', apiKey: 'sk-123' }
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([mockProvider]),
    })

    ;(global.fetch as any).mockRejectedValue(new Error('Connection refused'))

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })
    expect(response.status).toBe(502)
  })
})
