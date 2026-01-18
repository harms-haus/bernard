import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET, PATCH, DELETE } from './route'

// Hoisted mocks - must be before imports
const { mockRequireAdmin, mockStore } = vi.hoisted(() => {
  return {
    mockRequireAdmin: vi.fn().mockResolvedValue({ user: { id: 'admin-123' } }),
    mockStore: {
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }
})

vi.mock('@/lib/auth/server-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/server-helpers')>('@/lib/auth/server-helpers');
  return {
    ...actual,
    requireAdmin: vi.fn().mockImplementation(() => mockRequireAdmin()),
  };
});

vi.mock('@/lib/auth/tokenStore', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/tokenStore')>('@/lib/auth/tokenStore');
  return {
    ...actual,
    getTokenStore: vi.fn().mockImplementation(() => mockStore),
  };
});

describe('GET /api/tokens/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockClear()
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-123' } })
    mockStore.get.mockClear()
    mockStore.update.mockClear()
    mockStore.delete.mockClear()
  })

  it('should return token without secret', async () => {
    mockStore.get.mockResolvedValue({
      id: '1',
      name: 'Token 1',
      token: 'secret-123',
      status: 'active',
      createdAt: '2024-01-01',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.token.token).toBeUndefined()
  })

  it('should return 404 for unknown token', async () => {
    mockStore.get.mockResolvedValue(null)

    const params = Promise.resolve({ id: 'unknown' })
    const request = {} as import('next/server').NextRequest
    const response = await GET(request, { params })

    expect(response.status).toBe(404)
  })
})

describe('PATCH /api/tokens/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockClear()
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-123' } })
    mockStore.get.mockClear()
    mockStore.update.mockClear()
    mockStore.delete.mockClear()
  })

  it('should update token name', async () => {
    mockStore.update.mockResolvedValue({
      id: '1',
      name: 'New Name',
      token: 'secret-123',
      status: 'active',
      createdAt: '2024-01-01',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {
      json: async () => ({ name: 'New Name' }),
    } as unknown as import('next/server').NextRequest
    const response = await PATCH(request, { params })

    expect(response.status).toBe(200)
  })

  it('should toggle token status (maps disabled to revoked)', async () => {
    mockStore.update.mockResolvedValue({
      id: '1',
      name: 'Token 1',
      token: 'secret-123',
      status: 'revoked',
      createdAt: '2024-01-01',
    })

    const params = Promise.resolve({ id: '1' })
    const request = {
      json: async () => ({ status: 'disabled' }),
    } as unknown as import('next/server').NextRequest
    const response = await PATCH(request, { params })

    expect(response.status).toBe(200)
    // PATCH handler maps 'disabled' → 'revoked' internally
    expect(mockStore.update).toHaveBeenCalledWith('1', { status: 'revoked' })
  })

  it('should return 404 for unknown token', async () => {
    mockStore.update.mockResolvedValue(null)

    const params = Promise.resolve({ id: 'unknown' })
    const request = {
      json: async () => ({ name: 'New Name' }),
    } as unknown as import('next/server').NextRequest
    const response = await PATCH(request, { params })

    expect(response.status).toBe(404)
  })
})

describe('DELETE /api/tokens/[id]', () => {
  it('should delete token', async () => {
    // Set up mocks in the test itself
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-123' } })
    mockStore.delete.mockResolvedValue(true)

    const params = Promise.resolve({ id: '1' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })

    expect(response.status).toBe(204)
  })

  it('should return 404 for unknown token', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'admin-123' } })
    mockStore.delete.mockResolvedValue(false)

    const params = Promise.resolve({ id: 'unknown' })
    const request = {} as import('next/server').NextRequest
    const response = await DELETE(request, { params })

    expect(response.status).toBe(404)
  })
})
