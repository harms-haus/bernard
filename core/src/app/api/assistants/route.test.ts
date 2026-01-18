import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, POST } from './route'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

vi.mock('@/lib/langgraph/proxy', () => ({
  proxyToLangGraph: vi.fn(),
}))

describe('GET /api/assistants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy request to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('[]', { status: 200 }))

    const request = {
      url: 'http://localhost:3456/api/assistants',
    } as unknown as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(expect.anything(), '/assistants')
  })

  it('should pass query params to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('[]', { status: 200 }))

    const request = {
      url: 'http://localhost:3456/api/assistants?limit=10',
    } as unknown as import('next/server').NextRequest
    const response = await GET(request)

    expect(proxyToLangGraph).toHaveBeenCalledWith(expect.anything(), '/assistants?limit=10')
  })
})

describe('POST /api/assistants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy request to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('{}', { status: 200 }))

    const request = {
      json: async () => ({ name: 'New Assistant' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(expect.anything(), '/assistants')
  })
})
