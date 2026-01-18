import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Redis
const mockRedis = {
  smembers: vi.fn(),
  hgetall: vi.fn(),
  hset: vi.fn(),
  sadd: vi.fn(),
}

describe('GET /api/users', () => {
  let GET: (request: import('next/server').NextRequest) => Promise<import('next/server').NextResponse>
  let helpersModule: typeof import('@/lib/auth/server-helpers')

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    // Setup mocks BEFORE importing the route
    vi.doMock('@/lib/infra/redis', () => ({
      getRedis: vi.fn().mockReturnValue(mockRedis),
    }))

    vi.doMock('@/lib/logging/logger', () => ({
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    }))

    // Import the route module fresh with mocks in place
    helpersModule = await import('@/lib/auth/server-helpers')
    const routeModule = await import('./route')
    GET = routeModule.GET

    // Setup requireAdmin mock
    vi.spyOn(helpersModule, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123', role: 'admin' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should export GET function', () => {
    expect(GET).toBeDefined()
    expect(typeof GET).toBe('function')
  })

  it('should return 403 when not admin', async () => {
    vi.spyOn(helpersModule, 'requireAdmin').mockResolvedValue(null)

    const request = new Request('http://localhost/api/users') as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(403)
    const data = await response.json()
    expect(data.error).toBe('Admin access required')
  })

  it('should return users list for admin', async () => {
    mockRedis.smembers.mockResolvedValue(['user1', 'user2'])
    mockRedis.hgetall
      .mockResolvedValueOnce({
        id: 'user1',
        email: 'user1@example.com',
        name: 'User 1',
        role: 'user',
        emailVerified: 'true',
        createdAt: '2024-01-01T00:00:00Z',
      })
      .mockResolvedValueOnce({
        id: 'user2',
        email: 'user2@example.com',
        name: 'User 2',
        role: 'admin',
        emailVerified: 'true',
        createdAt: '2024-01-02T00:00:00Z',
      })

    const request = new Request('http://localhost/api/users') as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.users).toBeDefined()
    expect(Array.isArray(data.users)).toBe(true)
    expect(mockRedis.smembers).toHaveBeenCalledWith('ba:s:user:ids')
  })

  it('should handle errors gracefully', async () => {
    mockRedis.smembers.mockRejectedValue(new Error('Redis error'))

    const request = new Request('http://localhost/api/users') as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Internal server error')
  })
})

describe('POST /api/users', () => {
  let POST: (request: import('next/server').NextRequest) => Promise<import('next/server').NextResponse>
  let helpersModule: typeof import('@/lib/auth/server-helpers')

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    // Setup mocks BEFORE importing the route
    vi.doMock('@/lib/infra/redis', () => ({
      getRedis: vi.fn().mockReturnValue(mockRedis),
    }))

    vi.doMock('@/lib/logging/logger', () => ({
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    }))

    // Import the route module fresh with mocks in place
    helpersModule = await import('@/lib/auth/server-helpers')
    const routeModule = await import('./route')
    POST = routeModule.POST

    // Setup requireAdmin mock
    vi.spyOn(helpersModule, 'requireAdmin').mockResolvedValue({ user: { id: 'admin-123', role: 'admin' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should export POST function', () => {
    expect(POST).toBeDefined()
    expect(typeof POST).toBe('function')
  })

  it('should return 403 when not admin', async () => {
    vi.spyOn(helpersModule, 'requireAdmin').mockResolvedValue(null)

    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ id: 'user1', displayName: 'User 1', role: 'user' }),
    }) as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(403)
    const data = await response.json()
    expect(data.error).toBe('Admin access required')
  })

  it('should return 400 when id or displayName missing', async () => {
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ id: 'user1' }),
    }) as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('id and displayName are required')
  })

  it('should return 400 when role is invalid', async () => {
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ id: 'user1', displayName: 'User 1', role: 'invalid' }),
    }) as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Invalid role')
  })

  it('should return 400 when user already exists', async () => {
    mockRedis.hgetall.mockResolvedValue({ id: 'user1', email: 'user1@example.com' })

    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ id: 'user1', displayName: 'User 1', role: 'user' }),
    }) as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('User already exists')
  })

  it('should create user successfully', async () => {
    mockRedis.hgetall.mockResolvedValue({})
    mockRedis.hset.mockResolvedValue(1)
    mockRedis.sadd.mockResolvedValue(1)

    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ id: 'user1', displayName: 'User 1', role: 'user' }),
    }) as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.user).toBeDefined()
    expect(data.user.id).toBe('user1')
    expect(data.user.displayName).toBe('User 1')
    expect(data.user.role).toBe('user')
    expect(mockRedis.hset).toHaveBeenCalled()
    expect(mockRedis.sadd).toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    mockRedis.hgetall.mockRejectedValue(new Error('Redis error'))

    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ id: 'user1', displayName: 'User 1', role: 'user' }),
    }) as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})
