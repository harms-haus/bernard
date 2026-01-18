import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

vi.mock('@/lib/langgraph/proxy', () => ({
  proxyToLangGraph: vi.fn(),
}))

describe('POST /api/assistants/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy search request to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('[]', { status: 200 }))

    const request = {
      json: async () => ({ query: 'search term' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/assistants/search'
    )
  })
})
