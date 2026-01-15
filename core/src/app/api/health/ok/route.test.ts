import { describe, it, expect } from 'vitest'
import { handleOkCheck } from '@/lib/api/health-ok'

describe('GET /api/health/ok', () => {
  describe('handleOkCheck', () => {
    it('should return ok status', () => {
      const result = handleOkCheck()

      expect(result.status).toBe(200)
    })

    it('should include status in response', async () => {
      const result = handleOkCheck()
      const data = await result.json()

      expect(data.success).toBe(true)
      expect(data.data.status).toBe('ok')
    })

    it('should include timestamp', async () => {
      const result = handleOkCheck()
      const data = await result.json()

      expect(data.data.timestamp).toBeDefined()
    })

    it('should include service name', async () => {
      const result = handleOkCheck()
      const data = await result.json()

      expect(data.data.service).toBe('bernard-core')
    })

    it('should include version', async () => {
      const result = handleOkCheck()
      const data = await result.json()

      expect(data.data.version).toBeDefined()
    })
  })
})
