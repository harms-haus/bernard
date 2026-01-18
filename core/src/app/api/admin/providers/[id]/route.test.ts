import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, PUT, DELETE } from './route'
import * as helpers from '@/lib/auth/server-helpers'

// Shared mock store reference
const mockStore = {
  getProviders: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
}

// Mock settingsStore - must be before importing route
vi.mock('@/lib/config/settingsStore', () => ({
  initializeSettingsStore: vi.fn().mockResolvedValue({}),
  getSettingsStore: vi.fn().mockReturnValue(mockStore),
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
    mockStore.getProviders.mockResolvedValue([])

    const params = Promise.resolve({ id: 'non-existent' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })
    expect(response.status).toBe(404)
  })

  it('should return provider data', async () => {
    const mockProvider = { id: '1', name: 'OpenAI', baseUrl: 'https://api.openai.com', apiKey: 'sk-123', type: 'openai' }
    mockStore.getProviders.mockResolvedValue([mockProvider])

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
    mockStore.getProviders.mockResolvedValue([])
    mockStore.updateProvider.mockResolvedValue(null)

    const params = Promise.resolve({ id: 'non-existent' })
    const request = {
      json: async () => ({ name: 'NewName' }),
    } as unknown as import('next/server').NextRequest
    const response = await PUT(request, { params })
    expect(response.status).toBe(404)
  })

  it('should update provider fields', async () => {
    mockStore.getProviders.mockResolvedValue([{ id: '1', name: 'OldName' }])
    mockStore.updateProvider.mockResolvedValue({ id: '1', name: 'NewName' })

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
    mockStore.getProviders.mockResolvedValue([{ id: '1' }])
    mockStore.updateProvider.mockRejectedValue(new Error('Update failed'))

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
    mockStore.getProviders.mockResolvedValue([])
    mockStore.deleteProvider.mockResolvedValue(false)

    const params = Promise.resolve({ id: 'non-existent' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })
    expect(response.status).toBe(404)
  })

  it('should delete provider and return 204', async () => {
    mockStore.getProviders.mockResolvedValue([{ id: '1' }])
    mockStore.deleteProvider.mockResolvedValue(true)

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })
    expect(response.status).toBe(204)
  })

  it('should return 500 on delete error', async () => {
    mockStore.getProviders.mockResolvedValue([{ id: '1' }])
    mockStore.deleteProvider.mockRejectedValue(new Error('Delete failed'))

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })
    expect(response.status).toBe(500)
  })
})
