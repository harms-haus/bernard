import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/infra/service-queue', async () => {
  const actual = await vi.importActual('@/lib/infra/service-queue')
  return {
    ...actual as object,
    getQueueStats: vi.fn(),
  }
})

const { getQueueStats }: any = await import('@/lib/infra/service-queue')

describe('GET /api/services/jobs/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return job stats', async () => {
    getQueueStats.mockResolvedValue({
      waiting: 0,
      active: 1,
      completed: 100,
      failed: 0,
    })

    const response = await GET()

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.waiting).toBe(0)
    expect(data.active).toBe(1)
  })

  it('should return 500 on error', async () => {
    getQueueStats.mockRejectedValue(new Error('Redis error'))

    const response = await GET()

    expect(response.status).toBe(500)
  })
})
