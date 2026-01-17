import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import { GET, PUT } from './route'
import * as helpers from '@/lib/auth/server-helpers'

// Spy on the modules
const requireAdmin = vi.spyOn(helpers, 'requireAdmin')

// Mock settingsStore module - must be hoisted before imports
const mockStore = {
  getBackups: vi.fn(),
  setBackups: vi.fn(),
}

vi.mock('@/lib/config/settingsStore', () => ({
  initializeSettingsStore: vi.fn().mockResolvedValue({}),
  getSettingsStore: vi.fn().mockImplementation(() => mockStore),
  BackupSettingsSchema: {
    parse: (val: any) => val,
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  },
}))

describe('GET /api/settings/backups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdmin.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true } } as any)
  })

  const createMockRequest = () =>
    ({ url: 'http://localhost/api/settings/backups' }) as unknown as import('next/server').NextRequest

  it('should return backup settings for admin user', async () => {
    requireAdmin.mockResolvedValue({
      user: { id: 'admin-123', name: 'Admin', role: 'admin' },
    } as any)

    const mockBackupsData = {
      debounceSeconds: 60,
      directory: '/backups',
      retentionDays: 7,
      retentionCount: 20
    }

    mockStore.getBackups.mockResolvedValue(mockBackupsData)

    const request = createMockRequest()
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.debounceSeconds).toBe(60)
    expect(data.retentionDays).toBe(7)
    expect(data.directory).toBe('/backups')
    expect(data.retentionCount).toBe(20)
  })

  it('should return 403 when not admin', async () => {
    requireAdmin.mockResolvedValue(null)

    const request = createMockRequest()
    const response = await GET(request)

    expect(response.status).toBe(403)
  })

  it('should return empty object when no backups configured', async () => {
    requireAdmin.mockResolvedValue({
      user: { id: 'admin-123', name: 'Admin', role: 'admin' },
    } as any)

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
    requireAdmin.mockResolvedValue({
      user: { id: 'admin-123', name: 'Admin', role: 'admin' },
    } as any)
  })

  const createMockRequest = (body: object) =>
    ({
      url: 'http://localhost/api/settings/backups',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: vi.fn().mockResolvedValue(body),
    }) as unknown as import('next/server').NextRequest

  it('should update backup settings', async () => {
    const mockBackupsData = {
      debounceSeconds: 60,
      retentionDays: 14,
      directory: '/backups',
      retentionCount: 20
    }

    mockStore.getBackups.mockResolvedValue(mockBackupsData)
    mockStore.setBackups.mockResolvedValue(mockBackupsData)

    const request = createMockRequest({
      debounceSeconds: 60,
      retentionDays: 14,
      directory: '/backups',
      retentionCount: 20,
    })
    const response = await PUT(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.debounceSeconds).toBe(60)
    expect(data.retentionDays).toBe(14)
    expect(data.directory).toBe('/backups')
    expect(data.retentionCount).toBe(20)
  })

  it('should return 403 when not admin', async () => {
    requireAdmin.mockResolvedValue(null)

    const request = createMockRequest({ enabled: true })
    const response = await PUT(request)

    expect(response.status).toBe(403)
  })

  it('should update backup settings with different values', async () => {
    const mockBackupsData = {
      debounceSeconds: 120,
      retentionDays: 30,
      directory: '/var/backups',
      retentionCount: 10
    }

    mockStore.getBackups.mockResolvedValue(mockBackupsData)
    mockStore.setBackups.mockResolvedValue(mockBackupsData)

    const request = createMockRequest({
      debounceSeconds: 120,
      retentionDays: 30,
      directory: '/var/backups',
      retentionCount: 10,
    })
    const response = await PUT(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.debounceSeconds).toBe(120)
    expect(data.retentionDays).toBe(30)
    expect(data.directory).toBe('/var/backups')
    expect(data.retentionCount).toBe(10)
  })
})
