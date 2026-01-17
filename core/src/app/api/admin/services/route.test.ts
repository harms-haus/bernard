import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'
import { GET, PUT } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getSettingsStore } from '@/lib/config/settingsStore'

// Shared mock store reference
const mockStore = {
  getServices: vi.fn(),
  setServices: vi.fn(),
}

// Create a mock function for safeParse - must use vi.hoisted for references used in vi.mock
const mockSafeParse = vi.hoisted(() => vi.fn().mockReturnValue({ success: true, data: {} }));

// Mock Redis client
const mockRedis = vi.hoisted(() => ({}));

// Mock settingsStore module - must be hoisted before imports
vi.mock('@/lib/config/settingsStore', () => ({
  initializeSettingsStore: vi.fn().mockResolvedValue({}),
  getSettingsStore: vi.fn().mockImplementation(() => mockStore),
  ServicesSettingsSchema: {
    parse: (val: any) => val,
    safeParse: mockSafeParse,
  },
}))

// Mock Redis
vi.mock('@/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue(mockRedis),
}))

// Reset mock functions before each test
beforeEach(() => {
  mockStore.getServices.mockClear()
  mockStore.setServices.mockClear()
  mockSafeParse.mockReturnValue({ success: true, data: {} })
})

describe('GET /api/settings/services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock requireAdmin
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123', isAdmin: true } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return services settings', async () => {
    const mockServices = {
      kokoro: { enabled: true, baseUrl: 'http://localhost:8880' },
      whisper: { enabled: true, baseUrl: 'http://localhost:8870' },
    }

    mockStore.getServices.mockResolvedValue(mockServices)

    const request = {} as unknown as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.data).toEqual(mockServices)
  })

  it('should return 403 when not admin', async () => {
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue(null)

    const request = {} as unknown as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(403)
  })
})

describe('PUT /api/settings/services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123', isAdmin: true } } as any)
    // Ensure the store mock is properly set up for each test
    vi.mocked(getSettingsStore).mockReturnValue(mockStore as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should save valid services settings', async () => {
    const mockServices = { kokoro: { enabled: true, baseUrl: 'http://localhost:8880' } }
    const savedServices = { kokoro: { enabled: true, baseUrl: 'http://localhost:8880' } }

    // Mock the schema validation to return success with the parsed data
    mockSafeParse.mockReturnValue({ success: true, data: mockServices })
    mockStore.setServices.mockResolvedValue(savedServices)

    const request = {
      json: async () => mockServices,
    } as unknown as import('next/server').NextRequest
    const response = await PUT(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.data).toEqual(savedServices)
    expect(mockStore.setServices).toHaveBeenCalledWith(mockServices)
  })

  it('should return 400 for invalid settings', async () => {
    // Set up the mock to return a failed parse result
    mockSafeParse.mockReturnValue({
      success: false,
      error: { issues: [{ message: 'Invalid value' }] },
    })

    const request = {
      json: async () => ({}),
    } as unknown as import('next/server').NextRequest
    const response = await PUT(request)

    expect(response.status).toBe(400)
  })

  it('should return 500 when setServices throws', async () => {
    mockStore.setServices.mockRejectedValue(new Error('Failed'))

    const request = {
      json: async () => ({}),
    } as unknown as import('next/server').NextRequest
    const response = await PUT(request)

    expect(response.status).toBe(500)
  })
})
