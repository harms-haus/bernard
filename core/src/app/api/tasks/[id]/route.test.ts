import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from './route'
import * as helpers from '@/lib/auth/server-helpers'
import { TaskRecordKeeper } from '@/lib/infra'

// Mock infra module
vi.mock('@/lib/infra', () => ({
  TaskRecordKeeper: vi.fn().mockImplementation(() => ({
    recallTask: vi.fn(),
  })),
  getRedis: vi.fn().mockReturnValue({}),
}))

describe('GET /api/tasks/[id]', () => {
  let mockKeeper: any;

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue({ user: { id: 'user-123' } } as any)
    mockKeeper = {
      recallTask: vi.fn(),
    }
    vi.mocked(TaskRecordKeeper).mockImplementation(() => mockKeeper)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return task', async () => {
    mockKeeper.recallTask.mockResolvedValue({
      id: 'task-123',
      title: 'Test Task',
      status: 'pending',
    })

    const params = Promise.resolve({ id: 'task-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.id).toBe('task-123')
  })

  it('should return 404 for unknown task', async () => {
    mockKeeper.recallTask.mockResolvedValue(null)

    const params = Promise.resolve({ id: 'unknown' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(404)
  })

  it('should return 403 for unauthenticated', async () => {
    vi.spyOn(helpers, 'requireAuth').mockResolvedValue(null)

    const params = Promise.resolve({ id: 'task-123' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(403)
  })
})
