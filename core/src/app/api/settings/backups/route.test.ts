vi.mock('@/lib/auth/helpers', async () => {
  const actual = await vi.importActual('@/lib/auth/helpers')
  return {
    ...actual as object,
    requireAdmin: vi.fn(),
  }
})

vi.mock('@/lib/config/settingsStore', async () => {
  const actual = await vi.importActual('@/lib/config/settingsStore')

  const mockStore = {
    getBackups: vi.fn().mockResolvedValue({
      enabled: true,
      schedule: '0 2 * * *',
      retentionDays: 7,
      debounceSeconds: 60,
      directory: '/backups',
      retentionCount: 20
    }),
    setBackups: vi.fn().mockResolvedValue(undefined),
  }

  return {
    ...actual as object,
    SettingsStore: vi.fn().mockReturnValue(mockStore),
  }
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PUT } from './route'
import { NextResponse } from 'next/server'

const { requireAdmin }: any = await import('@/lib/auth/helpers')
const { SettingsStore }: any = await import('@/lib/config/settingsStore')

// Get the mock store instance
const mockStore = new SettingsStore()

describe('GET /api/settings/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = () =>
    ({ url: 'http://localhost/api/settings/backups' }) as unknown as import('next/server').NextRequest

  it('should return backup settings for admin user', async () => {
    requireAdmin.mockResolvedValue({
      user: { id: 'admin-123', displayName: 'Admin', isAdmin: true },
    })

    mockStore.getBackups.mockResolvedValue({
      enabled: true,
      schedule: '0 2 * * *',
      retentionDays: 7,
      debounceSeconds: 60,
      directory: '/backups',
      retentionCount: 20
    })

    const request = createMockRequest()
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.enabled).toBe(true)
    expect(data.schedule).toBe('0 2 * * *')
    expect(data.retentionDays).toBe(7)
  })

  it('should return 401 when not admin', async () => {
    requireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const request = createMockRequest()
    const response = await GET(request)

    expect(response.status).toBe(401)
  })

  it('should return empty object when no backups configured', async () => {
    requireAdmin.mockResolvedValue({
      user: { id: 'admin-123', displayName: 'Admin', isAdmin: true },
    })

    mockStore.getBackups.mockResolvedValue(null)

    const request = createMockRequest()
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({})
  })
})

describe('PUT /api/settings/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = (body: object) =>
    ({
      url: 'http://localhost/api/settings/backups',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue(body),
    }) as unknown as import('next/server').NextRequest

  it('should update backup settings', async () => {
    requireAdmin.mockResolvedValue({
      user: { id: 'admin-123', displayName: 'Admin', isAdmin: true },
    })

    const request = createMockRequest({
      enabled: true,
      schedule: '0 3 * * *',
      retentionDays: 14,
    })

    const response = await PUT(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.enabled).toBe(true)
    expect(data.schedule).toBe('0 3 * * *')
    expect(data.retentionDays).toBe(14)
  })

  it('should return 401 when not admin', async () => {
    requireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const request = createMockRequest({ enabled: true })
    const response = await PUT(request)

    expect(response.status).toBe(401)
  })

  it('should disable backups', async () => {
    requireAdmin.mockResolvedValue({
      user: { id: 'admin-123', displayName: 'Admin', isAdmin: true },
    })

    const request = createMockRequest({
      enabled: false,
      schedule: '',
      retentionDays: 0,
    })

    const response = await PUT(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.enabled).toBe(false)
  })
})
