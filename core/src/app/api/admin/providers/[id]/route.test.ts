import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, PUT, DELETE } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getSettingsStore } from '@/lib/config/settingsStore'

// Mock settingsStore - use vi.fn() directly in factory
vi.mock('@/lib/config/settingsStore', () => ({
  initializeSettingsStore: vi.fn().mockResolvedValue({}),
  getSettingsStore: vi.fn().mockReturnValue({
    getProviders: vi.fn(),
    updateProvider: vi.fn(),
    deleteProvider: vi.fn(),
  }),
  resetSettingsStore: vi.fn(),
}))

// Mock Redis
vi.mock('@/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue({}),
}))

describe('GET /api/admin/providers/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 404 for non-existent provider', async () => {
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([]),
      updateProvider: vi.fn(),
      deleteProvider: vi.fn(),
    })

    const params = Promise.resolve({ id: 'non-existent' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })
    expect(response.status).toBe(404)
  })

  it('should return provider data', async () => {
    const mockProvider = { id: '1', name: 'OpenAI', baseUrl: 'https://api.openai.com', apiKey: 'sk-123', type: 'openai' }
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([mockProvider]),
      updateProvider: vi.fn(),
      deleteProvider: vi.fn(),
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.name).toBe('OpenAI')
  })

  it('should return 403 for unauthenticated', async () => {
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue(null)

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })
    expect(response.status).toBe(403)
  })
})

describe('PUT /api/admin/providers/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 404 for non-existent provider', async () => {
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([]),
      updateProvider: vi.fn().mockResolvedValue(null),
      deleteProvider: vi.fn(),
    })

    const params = Promise.resolve({ id: 'non-existent' })
    const request = {
      json: async () => ({ name: 'NewName' }),
    } as unknown as import('next/server').NextRequest
    const response = await PUT(request, { params })
    expect(response.status).toBe(404)
  })

  it('should update provider fields', async () => {
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([{ id: '1', name: 'OldName' }]),
      updateProvider: vi.fn().mockResolvedValue({ id: '1', name: 'NewName' }),
      deleteProvider: vi.fn(),
    })

    const params = Promise.resolve({ id: '1' })
    const request = {
      json: async () => ({ name: 'NewName' }),
    } as unknown as import('next/server').NextRequest
    const response = await PUT(request, { params })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.name).toBe('NewName')
  })

  it('should return 500 on update error', async () => {
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([{ id: '1' }]),
      updateProvider: vi.fn().mockRejectedValue(new Error('Update failed')),
      deleteProvider: vi.fn(),
    })

    const params = Promise.resolve({ id: '1' })
    const request = {
      json: async () => ({ name: 'NewName' }),
    } as unknown as import('next/server').NextRequest
    const response = await PUT(request, { params })
    expect(response.status).toBe(500)
  })
})

describe('DELETE /api/admin/providers/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 404 for non-existent provider', async () => {
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([]),
      updateProvider: vi.fn(),
      deleteProvider: vi.fn().mockResolvedValue(false),
    })

    const params = Promise.resolve({ id: 'non-existent' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })
    expect(response.status).toBe(404)
  })

  it('should delete provider and return 204', async () => {
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([{ id: '1' }]),
      updateProvider: vi.fn(),
      deleteProvider: vi.fn().mockResolvedValue(true),
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })
    expect(response.status).toBe(204)
  })

  it('should return 500 on delete error', async () => {
    vi.mocked(getSettingsStore).mockReturnValue({
      getProviders: vi.fn().mockResolvedValue([{ id: '1' }]),
      updateProvider: vi.fn(),
      deleteProvider: vi.fn().mockRejectedValue(new Error('Delete failed')),
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })
    expect(response.status).toBe(500)
  })
})
