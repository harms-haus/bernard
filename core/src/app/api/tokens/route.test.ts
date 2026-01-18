// Mock state - hoisted to be available before vi.mock
const { mockRequireAdmin, mockStore } = vi.hoisted(() => {
  return {
    mockRequireAdmin: vi.fn().mockResolvedValue({ user: { id: 'admin-123' } }),
    mockStore: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
  }
})

// Mock requireAdmin - must mock since route imports it directly
vi.mock('@/lib/auth/server-helpers', () => ({
  requireAdmin: () => mockRequireAdmin(),
}))

vi.mock('@/lib/auth/tokenStore', () => ({
  getTokenStore: () => mockStore,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

describe('GET /api/tokens', () => {
  beforeEach(() => {
    // Reset mocks to default values between tests
    mockRequireAdmin.mockReset()
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-123' } })
    mockStore.list.mockReset()
    mockStore.list.mockResolvedValue([])
    mockStore.create.mockReset()
    mockStore.create.mockResolvedValue({
      id: 'new-123',
      name: 'My Token',
      token: 'secret-xyz',
      status: 'active',
      createdAt: '2024-01-01',
    })
  })

  it('should return tokens without secrets', async () => {
    mockStore.list.mockResolvedValue([
      { id: '1', name: 'Token 1', token: 'secret-123', status: 'active', createdAt: '2024-01-01' },
      { id: '2', name: 'Token 2', token: 'secret-456', status: 'revoked', createdAt: '2024-01-02' },
    ])

    const request = {} as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.data[0].token).toBeUndefined()
    expect(data.data[1].status).toBe('disabled')
  })

  it('should return empty array when no tokens', async () => {
    const request = {} as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.data).toEqual([])
  })

  it('should return 403 for non-admin', async () => {
    mockRequireAdmin.mockResolvedValue(null)

    const request = {} as import('next/server').NextRequest
    const response = await GET(request)

    expect(response.status).toBe(403)
  })

  it('should create token with name', async () => {
    const request = {
      json: async () => ({ name: 'My Token' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.token.id).toBe('new-123')
    expect(data.token.token).toBe('secret-xyz')
  })

  it('should return 400 for missing name', async () => {
    const request = {
      json: async () => ({}),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('should return 400 for empty name', async () => {
    const request = {
      json: async () => ({ name: '' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('should return 400 on creation error', async () => {
    mockStore.create.mockRejectedValue(new Error('Failed'))

    const request = {
      json: async () => ({ name: 'My Token' }),
    } as unknown as import('next/server').NextRequest
    const response = await POST(request)

    expect(response.status).toBe(400)
  })
})
