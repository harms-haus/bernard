import { describe, it, expect } from 'vitest'
import { handleReadyCheck } from '@/lib/api/health-ready'

describe('GET /api/health/ready', () => {
  describe('handleReadyCheck', () => {
    it('should return ready status', () => {
      const result = handleReadyCheck()

      expect(result.status).toBe(200)
    })

    it('should include status in response', async () => {
      const result = handleReadyCheck()
      const data = await result.json()

      expect(data.success).toBe(true)
      expect(data.data.status).toBe('ok')
    })

    it('should include timestamp', async () => {
      const result = handleReadyCheck()
      const data = await result.json()

      expect(data.data.timestamp).toBeDefined()
    })

    it('should include service name', async () => {
      const result = handleReadyCheck()
      const data = await result.json()

      expect(data.data.service).toBe('bernard-core')
    })
  })
})
