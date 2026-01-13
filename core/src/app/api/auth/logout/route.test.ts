import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleLogout } from './route'

// Mock session dependencies
vi.mock('../../../../lib/auth/session', () => ({
  clearSessionCookie: vi.fn(),
}))

// Re-import to get the mocked version
const { clearSessionCookie }: any = await import('../../../../lib/auth/session')

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSessionCookie.mockResolvedValue(undefined)
  })

  describe('handleLogout', () => {
    it('should return success on successful logout', async () => {
      const result = await handleLogout()

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(clearSessionCookie).toHaveBeenCalledTimes(1)
    })

    it('should return 500 when clearSessionCookie throws', async () => {
      clearSessionCookie.mockRejectedValue(new Error('Cookie error'))

      const result = await handleLogout()

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Failed to logout')
    })

    it('should handle non-Error exceptions', async () => {
      clearSessionCookie.mockRejectedValue('string error')

      const result = await handleLogout()

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.success).toBe(false)
    })
  })
})
