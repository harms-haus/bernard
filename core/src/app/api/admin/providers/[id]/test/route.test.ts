import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import * as helpers from '@/lib/auth/server-helpers'

// Shared mock store reference
const mockStore = {
  getProviders: vi.fn(),
  testProviderConnection: vi.fn(),
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

describe('POST /api/admin/providers/[id]/test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 404 if provider not found', async () => {
    mockStore.getProviders.mockResolvedValue([])

    const params = Promise.resolve({ id: 'non-existent' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })
    expect(response.status).toBe(404)
  })

  it('should return 403 for unauthenticated', async () => {
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue(null)

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })
    expect(response.status).toBe(403)
  })

  it('should return working status on successful connection', async () => {
    const mockProvider = { id: '1', name: 'OpenAI', baseUrl: 'https://api.openai.com', apiKey: 'sk-123' }
    mockStore.getProviders.mockResolvedValue([mockProvider])
    mockStore.testProviderConnection.mockResolvedValue({
      status: 'working',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.status).toBe('working')
    expect(data.testedAt).toBeDefined()
  })

  it('should detect configuration errors', async () => {
    const mockProvider = { id: '1', name: 'OpenAI' }
    mockStore.getProviders.mockResolvedValue([mockProvider])
    mockStore.testProviderConnection.mockResolvedValue({
      status: 'failed',
      error: 'Invalid baseUrl',
      errorType: 'configuration',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.status).toBe('failed')
    expect(data.errorType).toBe('configuration')
  })

  it('should detect authorization errors', async () => {
    const mockProvider = { id: '1', name: 'OpenAI' }
    mockStore.getProviders.mockResolvedValue([mockProvider])
    mockStore.testProviderConnection.mockResolvedValue({
      status: 'failed',
      error: 'Invalid API key',
      errorType: 'unauthorized',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })

    const data = await response.json()
    expect(data.errorType).toBe('unauthorized')
  })

  it('should detect server errors', async () => {
    const mockProvider = { id: '1', name: 'OpenAI' }
    mockStore.getProviders.mockResolvedValue([mockProvider])
    mockStore.testProviderConnection.mockResolvedValue({
      status: 'failed',
      error: 'Internal server error',
      errorType: 'server_error',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })

    const data = await response.json()
    expect(data.errorType).toBe('server_error')
  })

  it('should detect connection errors', async () => {
    const mockProvider = { id: '1', name: 'OpenAI' }
    mockStore.getProviders.mockResolvedValue([mockProvider])
    mockStore.testProviderConnection.mockResolvedValue({
      status: 'failed',
      error: 'Connection refused',
      errorType: 'connection',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })

    const data = await response.json()
    expect(data.errorType).toBe('connection')
  })

  it('should include testedAt timestamp', async () => {
    const mockProvider = { id: '1', name: 'OpenAI' }
    mockStore.getProviders.mockResolvedValue([mockProvider])
    mockStore.testProviderConnection.mockResolvedValue({
      status: 'working',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })

    const data = await response.json()
    expect(data.testedAt).toBeDefined()
  })

  it('should return 500 on test error', async () => {
    const mockProvider = { id: '1', name: 'OpenAI' }
    mockStore.getProviders.mockResolvedValue([mockProvider])
    mockStore.testProviderConnection.mockRejectedValue(new Error('Test failed'))

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })
    expect(response.status).toBe(500)
  })
})
