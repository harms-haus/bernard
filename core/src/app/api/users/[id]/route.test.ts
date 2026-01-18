import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, DELETE } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getRedis } from '@/lib/infra/redis'

// Mock Redis - use null to avoid vi.fn() hoisting issues
const mockRedis = {
  hgetall: null as any,
  del: null as any,
}

vi.mock('@/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue(mockRedis),
}))

describe('GET /api/users/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
    // Setup mock functions in beforeEach to avoid hoisting issues
    mockRedis.hgetall = vi.fn()
    mockRedis.del = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return user', async () => {
    mockRedis.hgetall.mockResolvedValue({
      id: 'user-123',
      name: 'Test User',
      role: 'user',
      emailVerified: 'true',
    })

    const params = Promise.resolve({ id: 'user-123' })
    const request = {} as import('next/server').NextRequest
    const result = await GET(request, { params })

    expect(result.status).toBe(200)
    const data = await result.json()
    expect(data.user.id).toBe('user-123')
  })

  it('should return 404 for unknown user', async () => {
    mockRedis.hgetall.mockResolvedValue({})

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
    // Setup mock functions in beforeEach to avoid hoisting issues
    mockRedis.hgetall = vi.fn()
    mockRedis.del = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should delete user', async () => {
    mockRedis.hgetall.mockResolvedValue({ id: 'user-123' })
    mockRedis.del.mockResolvedValue(1)

    const params = Promise.resolve({ id: 'user-123' })
    const request = {} as import('next/server').NextRequest
    const result = await DELETE(request, { params })

    expect(result.status).toBe(200)
    expect(mockRedis.del).toHaveBeenCalled()
  })

  it('should return 404 for unknown user', async () => {
    mockRedis.hgetall.mockResolvedValue({})

    const params = Promise.resolve({ id: 'unknown' })
    const request = {} as import('next/server').NextRequest
    const result = await DELETE(request, { params })

    expect(result.status).toBe(404)
  })
})
