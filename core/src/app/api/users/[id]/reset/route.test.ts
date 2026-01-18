import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getRedis } from '@/lib/infra/redis'

// Mock Redis - use vi.fn() directly in factory
vi.mock('@/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue({
    hgetall: vi.fn(),
  }),
}))

describe('POST /api/users/[id]/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should reset user', async () => {
    vi.mocked(getRedis).mockReturnValue({
      hgetall: vi.fn().mockResolvedValue({ id: 'user-123' }),
    })

    const params = Promise.resolve({ id: 'user-123' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.message).toBe('User reset')
  })

  it('should return 404 for unknown user', async () => {
    vi.mocked(getRedis).mockReturnValue({
      hgetall: vi.fn().mockResolvedValue({}),
    })

    const params = Promise.resolve({ id: 'unknown' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })

    expect(response.status).toBe(404)
  })

  it('should return 403 for non-admin', async () => {
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue(null)

    const params = Promise.resolve({ id: 'user-123' })
    const request = {} as import('next/server').NextRequest
    const response = await POST(request, { params })

    expect(response.status).toBe(403)
  })
})
