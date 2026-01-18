import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

// Mock the proxy module
vi.mock('@/lib/langgraph/proxy', () => ({
  proxyToLangGraph: vi.fn(),
}))

describe('GET /api/threads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return threads for authenticated user', async () => {
    vi.spyOn(helpers, 'getSession').mockResolvedValue({ user: { id: 'user-123' } } as any)
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('[]', { status: 200 }))

    const request = {
      url: 'http://localhost/api/threads',
    } as unknown as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('user_id=user-123')
    )
  })

  it('should handle unauthenticated request', async () => {
    vi.spyOn(helpers, 'getSession').mockResolvedValue(null)
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('[]', { status: 200 }))

    const request = {
      url: 'http://localhost/api/threads',
    } as unknown as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('user_id=undefined')
    )
  })

  it('should remove user_id from searchParams to prevent bypass', async () => {
    vi.spyOn(helpers, 'getSession').mockResolvedValue({ user: { id: 'user-123' } } as any)
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('[]', { status: 200 }))

    const request = {
      url: 'http://localhost/api/threads?user_id=attacker-id',
    } as unknown as import('next/server').NextRequest
    const response = await GET(request)

    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('user_id=user-123')
    )
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.stringContaining('attacker-id')
    )
  })
})

describe('POST /api/threads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create thread with userId in metadata', async () => {
    vi.spyOn(helpers, 'getSession').mockResolvedValue({ user: { id: 'user-123' } } as any)
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('{}', { status: 200 }))

    const request = {
      json: async () => ({ threadId: 'new-thread' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/threads',
      { userId: 'user-123' }
    )
  })

  it('should handle unauthenticated thread creation', async () => {
    vi.spyOn(helpers, 'getSession').mockResolvedValue(null)
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('{}', { status: 200 }))

    const request = {
      json: async () => ({ threadId: 'new-thread' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/threads',
      { userId: undefined }
    )
  })
})
