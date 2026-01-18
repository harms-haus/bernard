import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, DELETE } from './route'
import { proxyToLangGraph } from '@/lib/langgraph/proxy'

vi.mock('@/lib/langgraph/proxy', () => ({
  proxyToLangGraph: vi.fn(),
}))

describe('GET /api/assistants/[assistantId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy request to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response('{}', { status: 200 }))

    const params = Promise.resolve({ assistantId: 'assistant-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/assistants/assistant-123'
    )
  })
})

describe('DELETE /api/assistants/[assistantId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should proxy DELETE request to LangGraph', async () => {
    ;(proxyToLangGraph as any).mockResolvedValue(new Response(null, { status: 204 }))

    const params = Promise.resolve({ assistantId: 'assistant-123' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })

    expect(response.status).toBe(204)
    expect(proxyToLangGraph).toHaveBeenCalledWith(
      expect.anything(),
      '/assistants/assistant-123',
      { method: 'DELETE' }
    )
  })
})
