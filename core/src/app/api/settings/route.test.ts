import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import * as helpers from '../../../lib/auth/helpers'
import * as factory from '../../../lib/api/factory'
import { handleGetSettings } from './route'

// Spy on the helpers and factory modules
const requireAdmin = vi.spyOn(helpers, 'requireAdmin')
const getSettingsStore = vi.spyOn(factory, 'getSettingsStore')

describe('GET /api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdmin.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true } } as any)
  })

  describe('handleGetSettings', () => {
    it('should return settings for admin user', async () => {
      const mockSettings = {
        kokoro: { enabled: true, defaultVoice: 'alex' },
        whisper: { enabled: true, model: 'base' },
      }

      const mockStore = {
        getAll: vi.fn().mockResolvedValue(mockSettings),
      }
      getSettingsStore.mockReturnValue(mockStore as any)

      const result = await handleGetSettings({} as any)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data).toEqual(mockSettings)
    })

    it('should return 403 when not admin', async () => {
      requireAdmin.mockResolvedValue(new NextResponse('Forbidden', { status: 403 }))

      const result = await handleGetSettings({} as any)

      expect(result.status).toBe(403)
    })

    it('should return 500 when getAll throws', async () => {
      const mockStore = {
        getAll: vi.fn().mockRejectedValue(new Error('Failed')),
      }
      getSettingsStore.mockReturnValue(mockStore as any)

      const result = await handleGetSettings({} as any)

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.error).toBe('Failed to get settings')
    })
  })
})
