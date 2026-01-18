import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getRedis } from '@/lib/infra/redis'

// Mock Redis - use empty object to avoid vi.fn() hoisting issues
const mockRedis = {
  smembers: null as any,
  hgetall: null as any,
  hset: null as any,
  sadd: null as any,
}

vi.mock('@/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue(mockRedis),
}))

describe('GET /api/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
    // Setup mock functions in beforeEach to avoid hoisting issues
    mockRedis.smembers = vi.fn()
    mockRedis.hgetall = vi.fn()
    mockRedis.hset = vi.fn()
    mockRedis.sadd = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return all users', async () => {
    mockRedis.smembers.mockResolvedValue(['user-1', 'user-2'])
    mockRedis.hgetall.mockImplementation((key: string) => {
      if (key.includes('user-1')) {
        return Promise.resolve({ id: 'user-1', name: 'User 1', role: 'user', emailVerified: 'true' })
      }
      return Promise.resolve({ id: 'user-2', name: 'User 2', role: 'admin' })
    })

    const request = {} as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.users).toHaveLength(2)
  })

  it('should return empty array when no users', async () => {
    mockRedis.smembers.mockResolvedValue([])

    const request = {} as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.users).toEqual([])
  })

  it('should return 403 for non-admin', async () => {
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue(null)

    const request = {} as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(403)
  })
})

describe('POST /api/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123' } } as any)
    // Setup mock functions in beforeEach to avoid hoisting issues
    mockRedis.hgetall = vi.fn()
    mockRedis.hset = vi.fn()
    mockRedis.sadd = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create user with required fields', async () => {
    mockRedis.hgetall.mockResolvedValue({})

    const request = {
      json: async () => ({ id: 'new-user', displayName: 'New User', role: 'user' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.user.id).toBe('new-user')
    expect(data.user.displayName).toBe('New User')
  })

  it('should return 400 for missing id', async () => {
    const request = {
      json: async () => ({ displayName: 'User', role: 'user' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('should return 400 for missing displayName', async () => {
    const request = {
      json: async () => ({ id: 'user', role: 'user' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('should return 400 for duplicate user', async () => {
    mockRedis.hgetall.mockResolvedValue({ id: 'existing-user' })

    const request = {
      json: async () => ({ id: 'existing-user', displayName: 'User', role: 'user' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('already exists')
  })
})
