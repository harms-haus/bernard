import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, DELETE } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getRedis } from '@/lib/infra/redis'

// Mock Redis - use vi.fn() directly in factory
vi.mock('@/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue({
    hgetall: vi.fn(),
    del: vi.fn(),
  }),
}))

describe('GET /api/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return user', async () => {
    vi.mocked(getRedis).mockReturnValue({
      hgetall: vi.fn().mockResolvedValue({
        id: 'user-123',
        name: 'Test User',
        role: 'user',
        emailVerified: 'true',
      }),
      del: vi.fn(),
    })

    const params = Promise.resolve({ id: 'user-123' })
    const request = {} as import('next/server').NextRequest
    const result = await GET(request, { params })

    expect(result.status).toBe(200)
    const data = await result.json()
    expect(data.user.id).toBe('user-123')
  })

  it('should return 404 for unknown user', async () => {
    vi.mocked(getRedis).mockReturnValue({
      hgetall: vi.fn().mockResolvedValue({}),
      del: vi.fn(),
    })

    const params = Promise.resolve({ id: 'unknown' })
    const request = {} as import('next/server').NextRequest
    const result = await GET(request, { params })

    expect(result.status).toBe(404)
  })
})

describe('DELETE /api/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should delete user', async () => {
    vi.mocked(getRedis).mockReturnValue({
      hgetall: vi.fn().mockResolvedValue({ id: 'user-123' }),
      del: vi.fn().mockResolvedValue(1),
    })

    const params = Promise.resolve({ id: 'user-123' })
    const request = {} as import('next/server').NextRequest
    const result = await DELETE(request, { params })

    expect(result.status).toBe(200)
    expect(vi.mocked(getRedis)().del).toHaveBeenCalled()
  })

  it('should return 404 for unknown user', async () => {
    vi.mocked(getRedis).mockReturnValue({
      hgetall: vi.fn().mockResolvedValue({}),
      del: vi.fn(),
    })

    const params = Promise.resolve({ id: 'unknown' })
    const request = {} as import('next/server').NextRequest
    const result = await DELETE(request, { params })

    expect(result.status).toBe(404)
  })
})
