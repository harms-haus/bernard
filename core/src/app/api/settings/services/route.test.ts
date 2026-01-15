import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'
import * as helpers from '../../../../lib/auth/helpers'
import * as factory from '../../../../lib/api/factory'
import { ServicesSettingsSchema } from '../../../../lib/config/settingsStore'
import { handleGetServicesSettings, handlePutServicesSettings } from '@/lib/api/settings-services'

// Spy on the modules
const requireAdmin = vi.spyOn(helpers, 'requireAdmin')
const getSettingsStore = vi.spyOn(factory, 'getSettingsStore')

describe('GET /api/settings/services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdmin.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true } } as any)
  })

  describe('handleGetServicesSettings', () => {
    it('should return services settings', async () => {
      const mockServices = {
        kokoro: { enabled: true, defaultVoice: 'alex' },
        whisper: { enabled: true, model: 'base' },
      }

      const mockStore = {
        getServices: vi.fn().mockResolvedValue(mockServices),
      }
      getSettingsStore.mockReturnValue(mockStore as any)

      const result = await handleGetServicesSettings({} as any)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data).toEqual(mockServices)
    })

    it('should return 403 when not admin', async () => {
      requireAdmin.mockResolvedValue(new NextResponse('Forbidden', { status: 403 }))

      const result = await handleGetServicesSettings({} as any)

      expect(result.status).toBe(403)
    })
  })

})

describe('PUT /api/settings/services', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdmin.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true } } as any)
  })

  describe('handlePutServicesSettings', () => {
    it('should save valid services settings', async () => {
      const mockServices = { kokoro: { enabled: true } } as any
      const savedServices = { kokoro: { enabled: true, defaultVoice: 'alex' } }

      const mockStore = {
        setServices: vi.fn().mockResolvedValue(savedServices),
      }
      getSettingsStore.mockReturnValue(mockStore as any)
      vi.spyOn(ServicesSettingsSchema, 'safeParse').mockReturnValue({ success: true, data: mockServices })

      const result = await handlePutServicesSettings({
        json: async () => mockServices,
      } as unknown as import('next/server').NextRequest)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(mockStore.setServices).toHaveBeenCalledWith(mockServices)
    })

    it('should return 400 for invalid settings', async () => {
      vi.spyOn(ServicesSettingsSchema, 'safeParse').mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid value' }] },
      } as any)

      const result = await handlePutServicesSettings({
        json: async () => ({}),
      } as unknown as import('next/server').NextRequest)

      expect(result.status).toBe(400)
    })

    it('should return 500 when setServices throws', async () => {
      const mockStore = {
        setServices: vi.fn().mockRejectedValue(new Error('Failed')),
      }
      getSettingsStore.mockReturnValue(mockStore as any)
      vi.spyOn(ServicesSettingsSchema, 'safeParse').mockReturnValue({ success: true, data: {} } as any)

      const result = await handlePutServicesSettings({
        json: async () => ({}),
      } as unknown as import('next/server').NextRequest)

      expect(result.status).toBe(500)
    })
  })
})
