import { describe, it, expect, vi } from 'vitest'
import { NextResponse } from 'next/server'
import * as helpers from '../../../../lib/auth/helpers'
import { handleListServices, handleManageService } from './route'

// Spy on the exported function
const requireAdminSpy = vi.spyOn(helpers, 'requireAdmin')

describe('GET /api/admin/services', () => {
  describe('handleListServices', () => {
    it('should return list of services', async () => {
      requireAdminSpy.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true }, sessionId: 'test-session' } as any)

      const result = await handleListServices({} as any)

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.services).toBeInstanceOf(Array)
      expect(data.data.services.length).toBeGreaterThan(0)
    })

    it('should return 403 when not admin', async () => {
      requireAdminSpy.mockResolvedValue(new NextResponse('Forbidden', { status: 403 }))

      const result = await handleListServices({} as any)

      expect(result.status).toBe(403)
    })
  })

  describe('handleManageService', () => {
    it('should return success for valid service', async () => {
      requireAdminSpy.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true }, sessionId: 'test-session' } as any)
      const result = await handleManageService({} as any, { service: 'bernard-agent', action: 'restart' })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.serviceId).toBe('bernard-agent')
      expect(data.data.action).toBe('restart')
    })

    it('should return 400 when service is missing', async () => {
      requireAdminSpy.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true }, sessionId: 'test-session' } as any)
      const result = await handleManageService({} as any, { action: 'restart' })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.error).toContain('Service name is required')
    })

    it('should return 400 when service is not a string', async () => {
      requireAdminSpy.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true }, sessionId: 'test-session' } as any)
      const result = await handleManageService({} as any, { service: 123 })

      expect(result.status).toBe(400)
    })

    it('should return 400 for unknown service', async () => {
      requireAdminSpy.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true }, sessionId: 'test-session' } as any)
      const result = await handleManageService({} as any, { service: 'unknown-service' })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.error).toContain('Invalid service name')
    })

    it('should return 403 for docker services', async () => {
      requireAdminSpy.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true }, sessionId: 'test-session' } as any)
      const result = await handleManageService({} as any, { service: 'redis', action: 'restart' })

      expect(result.status).toBe(403)
      const data = await result.json()
      expect(data.error).toContain('Cannot restart docker services')
    })

    it('should use default action when not provided', async () => {
      requireAdminSpy.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true }, sessionId: 'test-session' } as any)
      const result = await handleManageService({} as any, { service: 'bernard-agent' })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.data.action).toBe('restart')
    })

    it('should return 400 for invalid action', async () => {
      requireAdminSpy.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true }, sessionId: 'test-session' } as any)
      const result = await handleManageService({} as any, { service: 'bernard-agent', action: 'invalid-action' })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.error).toContain("Invalid action 'invalid-action' for service 'bernard-agent'")
      expect(data.error).toContain("Allowed actions: restart, stop, start")
      expect(data.details.allowedActions).toEqual(['restart', 'stop', 'start'])
      expect(data.details.requestedAction).toBe('invalid-action')
      expect(data.details.serviceId).toBe('bernard-agent')
    })

    it('should return 400 for invalid action with unknown service', async () => {
      requireAdminSpy.mockResolvedValue({ user: { id: 'admin-123', isAdmin: true }, sessionId: 'test-session' } as any)
      const result = await handleManageService({} as any, { service: '', action: 'invalid-action' })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.error).toContain("Invalid action 'invalid-action' for service 'unknown'")
      expect(data.details.serviceId).toBe('')
    })
  })
})
