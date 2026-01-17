import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import * as helpers from '@/lib/auth/server-helpers'

// Mock the factory module
vi.mock('../../../lib/api/factory', () => ({
  getServiceManager: vi.fn(),
}))

// Mock the auth helpers
vi.mock('@/lib/auth/server-helpers', async () => {
  const actual = await vi.importActual('@/lib/auth/server-helpers')
  return {
    ...actual as object,
    requireAuth: vi.fn(),
  }
})

// Re-import to get the mocked version
const { getServiceManager }: any = await import('../../../lib/api/factory')
const { requireAuth }: any = await import('@/lib/auth/server-helpers')

describe('GET /api/services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock requireAuth to return a valid session
    requireAuth.mockResolvedValue({ user: { id: 'user-123' } } as any)
  })

  it('should return all service statuses', async () => {
    const mockStatuses = [
      { id: 'redis', name: 'REDIS', status: 'running' as const, color: 'green' },
      { id: 'bernard-agent', name: 'AGENT', status: 'running' as const, color: 'green' },
    ]

    const mockManager = {
      getAllStatus: vi.fn().mockResolvedValue(mockStatuses),
    }
    getServiceManager.mockReturnValue(mockManager)

    const result = await GET({} as any)

    expect(result.status).toBe(200)
    const data = await result.json()
    expect(data.success).toBe(true)
    expect(data.data).toEqual(mockStatuses)
    expect(mockManager.getAllStatus).toHaveBeenCalledTimes(1)
  })

  it('should return 403 when not authenticated', async () => {
    requireAuth.mockResolvedValue(null)

    const result = await GET({} as any)

    expect(result.status).toBe(403)
  })

  it('should return 500 when getAllStatus throws', async () => {
    const mockManager = {
      getAllStatus: vi.fn().mockRejectedValue(new Error('Failed to get statuses')),
    }
    getServiceManager.mockReturnValue(mockManager)

    const result = await GET({} as any)

    expect(result.status).toBe(500)
    const data = await result.json()
    expect(data.error).toBe('Failed to get service status')
  })

  it('should handle non-Error exceptions', async () => {
    const mockManager = {
      getAllStatus: vi.fn().mockRejectedValue('string error'),
    }
    getServiceManager.mockReturnValue(mockManager)

    const result = await GET({} as any)

    expect(result.status).toBe(500)
  })

  it('should return empty array when no services', async () => {
    const mockManager = {
      getAllStatus: vi.fn().mockResolvedValue([]),
    }
    getServiceManager.mockReturnValue(mockManager)

    const result = await GET({} as any)

    expect(result.status).toBe(200)
    const data = await result.json()
    expect(data.success).toBe(true)
    expect(data.data).toEqual([])
  })
})
