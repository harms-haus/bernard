import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'
import { GET, POST } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getSettingsStore, initializeSettingsStore } from '@/lib/config/settingsStore'
import { getRedis } from '@/lib/infra/redis'

// Shared mock store reference
const mockStore = {
  getProviders: vi.fn(),
  getModels: vi.fn(),
  addProvider: vi.fn(),
}

// Mock settingsStore module
vi.mock('@/lib/config/settingsStore', () => ({
  initializeSettingsStore: vi.fn().mockResolvedValue({}),
  getSettingsStore: vi.fn().mockImplementation(() => mockStore),
}))

// Mock Redis - define inline to avoid hoisting issues
vi.mock('@/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue({}),
}))

describe('GET /api/admin/providers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication', () => {
    it('should return 403 for unauthenticated request', async () => {
      vi.spyOn(helpers, 'requireAdmin').mockResolvedValue(null)

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('Admin access required')
    })
  })

  describe('GET Response', () => {
    it('should return all providers', async () => {
      const mockProviders = [
        { id: '1', name: 'OpenAI', baseUrl: 'https://api.openai.com', apiKey: 'sk-123', type: 'openai' },
        { id: '2', name: 'Ollama', baseUrl: 'http://localhost:11434', apiKey: 'ollama-key', type: 'ollama' },
      ]
      mockStore.getProviders.mockResolvedValue(mockProviders)

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveLength(2)
      expect(data[0].name).toBe('OpenAI')
    })

    it('should return empty array when no providers exist', async () => {
      mockStore.getProviders.mockResolvedValue([])

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual([])
    })

    it('should return 500 on Redis error', async () => {
      mockStore.getProviders.mockRejectedValue(new Error('Redis connection failed'))

      const request = {} as import('next/server').NextRequest
      const response = await GET(request)

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toContain('Internal server error')
    })
  })
})

describe('POST /api/admin/providers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication', () => {
    it('should return 403 for unauthenticated request', async () => {
      vi.spyOn(helpers, 'requireAdmin').mockResolvedValue(null)

      const request = {
        json: async () => ({
          name: 'TestProvider',
          baseUrl: 'https://api.test.com',
          apiKey: 'test-key',
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('Admin access required')
    })
  })

  describe('Validation', () => {
    it('should return 400 for missing name', async () => {
      const request = {
        json: async () => ({ baseUrl: 'https://api.test.com', apiKey: 'test-key' }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('name')
    })

    it('should return 400 for missing baseUrl', async () => {
      const request = {
        json: async () => ({ name: 'TestProvider', apiKey: 'test-key' }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('should return 400 for missing apiKey', async () => {
      const request = {
        json: async () => ({ name: 'TestProvider', baseUrl: 'https://api.test.com' }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('should return 400 for duplicate provider name', async () => {
      mockStore.getModels.mockResolvedValue({ providers: [{ name: 'Existing' }] })

      const request = {
        json: async () => ({ name: 'Existing', baseUrl: 'https://api.test.com', apiKey: 'test-key' }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('already exists')
    })
  })

  describe('POST Success', () => {
    it('should create provider and return 201', async () => {
      mockStore.getModels.mockResolvedValue({ providers: [] })
      mockStore.addProvider.mockResolvedValue({
        id: 'new-123',
        name: 'TestProvider',
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        type: 'openai',
      })

      const request = {
        json: async () => ({
          name: 'TestProvider',
          baseUrl: 'https://api.test.com',
          apiKey: 'test-key',
          type: 'openai',
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(201)

      const data = await response.json()
      expect(data.id).toBe('new-123')
      expect(data.name).toBe('TestProvider')
      expect(mockStore.addProvider).toHaveBeenCalled()
    })

    it('should default type to openai when not specified', async () => {
      mockStore.getModels.mockResolvedValue({ providers: [] })
      mockStore.addProvider.mockResolvedValue({
        id: 'new-123',
        name: 'TestProvider',
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        type: 'openai',
      })

      const request = {
        json: async () => ({
          name: 'TestProvider',
          baseUrl: 'https://api.test.com',
          apiKey: 'test-key',
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(201)

      expect(mockStore.addProvider).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'openai' })
      )
    })
  })

  describe('Error Handling', () => {
    it('should return 500 on Redis write failure', async () => {
      mockStore.getModels.mockResolvedValue({ providers: [] })
      mockStore.addProvider.mockRejectedValue(new Error('Write failed'))

      const request = {
        json: async () => ({
          name: 'TestProvider',
          baseUrl: 'https://api.test.com',
          apiKey: 'test-key',
        }),
      } as unknown as import('next/server').NextRequest

      const response = await POST(request)
      expect(response.status).toBe(500)
    })
  })
})
