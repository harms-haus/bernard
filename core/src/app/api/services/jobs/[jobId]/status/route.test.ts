import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getServiceJobStatus } from '@/lib/infra/service-queue'

vi.mock('@/lib/infra/service-queue', () => ({
  getServiceJobStatus: vi.fn(),
}))

describe('GET /api/services/jobs/[jobId]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return job info', async () => {
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue({ user: { id: 'user-123' } } as any)
    ;(getServiceJobStatus as any).mockResolvedValue({
      id: 'job-123',
      status: 'completed',
      name: 'start-whisper',
    })

    const params = Promise.resolve({ jobId: 'job-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.id).toBe('job-123')
    expect(data.status).toBe('completed')
  })

  it('should return 404 for unknown job', async () => {
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue({ user: { id: 'user-123' } } as any)
    ;(getServiceJobStatus as any).mockResolvedValue(null)

    const params = Promise.resolve({ jobId: 'unknown-job' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(404)
  })

  it('should return 401 for unauthenticated', async () => {
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue(null)

    const params = Promise.resolve({ jobId: 'job-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(401)
  })

  it('should return 500 on error', async () => {
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue({ user: { id: 'user-123' } } as any)
    ;(getServiceJobStatus as any).mockRejectedValue(new Error('Failed'))

    const params = Promise.resolve({ jobId: 'job-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(500)
  })
})
