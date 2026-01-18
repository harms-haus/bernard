import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from './route'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

vi.mock('@/lib/langgraph/proxy', () => ({
  proxyToLangGraph: vi.fn(),
}))

describe('GET /api/threads/[threadId]/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy request to LangGraph with query params', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('[]', { status: 200 }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {
      url: 'http://localhost:3456/api/threads/thread-123/runs?limit=10',
    } as unknown as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/threads/thread-123/runs?limit=10'
    )
  })

  it('should proxy request without query params', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('[]', { status: 200 }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {
      url: 'http://localhost:3456/api/threads/thread-123/runs',
    } as unknown as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/threads/thread-123/runs'
    )
  })
})

describe('POST /api/threads/[threadId]/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy request to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('{}', { status: 200 }))

    const params = Promise.resolve({ threadId: 'thread-123' })
    const request = {
      json: async () => ({ input: { messages: [] } }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request, { params })

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/threads/thread-123/runs'
    )
  })
})
