vi.mock('@/lib/auth/helpers', async () => {
  const actual = await vi.importActual('@/lib/auth/helpers')
  return {
    ...actual as object,
    requireAdmin: vi.fn(),
  }
})

// Mock the SettingsStoreCore class
vi.mock('@/lib/config/settingsStore', async () => {
  const actual = await vi.importActual('@/lib/config/settingsStore')

  // Create mock data (matching BackupSettingsSchema - no enabled or schedule fields)
  const mockBackupsData = {
    debounceSeconds: 60,
    directory: '/backups',
    retentionDays: 7,
    retentionCount: 20
  }

  // Create a mock instance - note: vi.fn() needs to be created inside the factory
  const getBackupsMock = vi.fn().mockResolvedValue(mockBackupsData)
  const setBackupsMock = vi.fn().mockResolvedValue(undefined)

  const mockStoreInstance = {
    getBackups: getBackupsMock,
    setBackups: setBackupsMock,
  }

  // Mock class that returns our mock instance
  const MockSettingsStoreCore = vi.fn().mockImplementation(() => mockStoreInstance)

  return {
    ...actual as object,
    SettingsStoreCore: MockSettingsStoreCore,
    SettingsStore: MockSettingsStoreCore,
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

    // Configure mock return value for this test
    mockStore.getBackups.mockResolvedValue({
      debounceSeconds: 60,
      directory: '/backups',
      retentionDays: 7,
      retentionCount: 20
    })

    const request = createMockRequest()
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.debounceSeconds).toBe(60)
    expect(data.retentionDays).toBe(7)
    expect(data.directory).toBe('/backups')
    expect(data.retentionCount).toBe(20)
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

    // Configure mock to return null
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

    // Configure the mock to return the updated values
    mockStore.getBackups.mockResolvedValue({
      debounceSeconds: 60,
      retentionDays: 14,
      directory: '/backups',
      retentionCount: 20
    })

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

  it('should return 401 when not admin', async () => {
    requireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const request = createMockRequest({ enabled: true })
    const response = await PUT(request)

    expect(response.status).toBe(401)
  })

  it('should update backup settings with different values', async () => {
    requireAdmin.mockResolvedValue({
      user: { id: 'admin-123', displayName: 'Admin', isAdmin: true },
    })

    // Configure the mock to return the updated values
    mockStore.getBackups.mockResolvedValue({
      debounceSeconds: 120,
      retentionDays: 30,
      directory: '/var/backups',
      retentionCount: 10
    })

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
