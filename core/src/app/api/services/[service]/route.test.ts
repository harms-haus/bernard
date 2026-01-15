import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleGetService, handleServiceCommand } from '@/lib/api/services-dynamic'

// Mock dependencies
vi.mock('../../../../lib/api/factory', () => ({
  getServiceManager: vi.fn(),
}))

vi.mock('../../../../lib/infra/service-queue', () => ({
  addServiceJob: vi.fn(),
}))

// Re-import to get mocked versions
const { getServiceManager }: any = await import('../../../../lib/api/factory')
const { addServiceJob }: any = await import('../../../../lib/infra/service-queue')

describe('GET /api/services/[service]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('handleGetService', () => {
    it('should return service config and status', async () => {
      const mockStatus = {
        id: 'redis',
        name: 'REDIS',
        status: 'running' as const,
        health: { status: 'up' as const },
        color: 'green',
      }
      const mockHealth = {
        service: 'redis',
        status: 'up' as const,
        lastChecked: new Date(),
      }

      const mockManager = {
        getStatus: vi.fn().mockResolvedValue(mockStatus),
        healthCheck: vi.fn().mockResolvedValue(mockHealth),
      }
      getServiceManager.mockReturnValue(mockManager)

      const result = await handleGetService('redis')

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.config.id).toBe('redis')
      expect(data.data.status.id).toBe('redis')
      expect(data.data.health.service).toBe('redis')
    })

    it('should return 404 for unknown service', async () => {
      const result = await handleGetService('unknown-service')

      expect(result.status).toBe(404)
      const data = await result.json()
      expect(data.success).toBe(false)
      expect(data.error).toBe('Service not found')
    })

    it('should return 500 when getStatus throws', async () => {
      const mockManager = {
        getStatus: vi.fn().mockRejectedValue(new Error('Failed')),
        healthCheck: vi.fn(),
      }
      getServiceManager.mockReturnValue(mockManager)

      const result = await handleGetService('redis')

      expect(result.status).toBe(500)
    })
  })

  describe('handleServiceCommand', () => {
    it('should queue start command', async () => {
      addServiceJob.mockResolvedValue('job-123')

      const result = await handleServiceCommand('redis', { command: 'start' })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.success).toBe(true)
      expect(data.data.jobId).toBe('job-123')
      expect(data.data.status).toBe('queued')
      expect(addServiceJob).toHaveBeenCalledWith('redis', 'start', { initiatedBy: 'api' })
    })

    it('should queue stop command', async () => {
      addServiceJob.mockResolvedValue('job-456')

      const result = await handleServiceCommand('bernard-agent', { command: 'stop' })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.data.command).toBe('stop')
    })

    it('should queue restart command', async () => {
      addServiceJob.mockResolvedValue('job-789')

      const result = await handleServiceCommand('kokoro', { command: 'restart' })

      expect(result.status).toBe(200)
      const data = await result.json()
      expect(data.data.command).toBe('restart')
    })

    it('should return 404 for unknown service', async () => {
      const result = await handleServiceCommand('unknown-service', { command: 'start' })

      expect(result.status).toBe(404)
    })

    it('should return 400 for invalid command', async () => {
      const result = await handleServiceCommand('redis', { command: 'invalid' })

      expect(result.status).toBe(400)
      const data = await result.json()
      expect(data.error).toContain('Invalid command')
    })

    it('should return 400 when command is missing', async () => {
      const result = await handleServiceCommand('redis', {})

      expect(result.status).toBe(400)
    })

    it('should return 500 when addServiceJob throws', async () => {
      addServiceJob.mockRejectedValue(new Error('Queue error'))

      const result = await handleServiceCommand('redis', { command: 'start' })

      expect(result.status).toBe(500)
      const data = await result.json()
      expect(data.error).toBe('Failed to queue action')
    })
  })
})
