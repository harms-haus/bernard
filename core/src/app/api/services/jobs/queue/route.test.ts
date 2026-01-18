import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { getServiceJobs } from '@/lib/infra/service-queue'
import { NextRequest } from 'next/server'

vi.mock('@/lib/infra/service-queue', () => ({
  getServiceJobs: vi.fn(),
}))

describe('GET /api/services/jobs/queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return all jobs', async () => {
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue({ user: { id: 'user-123' } } as any)
    ;(getServiceJobs as any).mockResolvedValue([
      { id: 'job-1', status: 'completed' },
      { id: 'job-2', status: 'running' },
    ])

    const request = new NextRequest(new URL('http://localhost/api/services/jobs/queue'))
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('success', true)
    expect(data.data).toHaveLength(2)
  })

  it('should filter by service query param', async () => {
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue({ user: { id: 'user-123' } } as any)
    ;(getServiceJobs as any).mockResolvedValue([
      { id: 'job-1', status: 'completed' },
    ])

    const request = new NextRequest(new URL('http://localhost/api/services/jobs/queue?service=whisper'))
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(getServiceJobs).toHaveBeenCalledWith('whisper')
  })

  it('should return 401 for unauthenticated', async () => {
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue(null)

    const request = new NextRequest(new URL('http://localhost/api/services/jobs/queue'))
    const response = await GET(request)

    expect(response.status).toBe(401)
  })

  it('should return 500 on error', async () => {
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue({ user: { id: 'user-123' } } as any)
    ;(getServiceJobs as any).mockRejectedValue(new Error('Failed'))

    const request = new NextRequest(new URL('http://localhost/api/services/jobs/queue'))
    const response = await GET(request)

    expect(response.status).toBe(500)
  })
})
