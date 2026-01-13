import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withTimeout } from './timeouts'

describe('timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('withTimeout', () => {
    it('should resolve immediately if promise completes before timeout', async () => {
      const promise = Promise.resolve('success')
      const result = await withTimeout(promise, 5000, 'test')

      expect(result).toBe('success')
    })

    it('should resolve immediately if timeout is 0', async () => {
      const promise = Promise.resolve('success')
      const result = await withTimeout(promise, 0, 'test')

      expect(result).toBe('success')
    })

    it('should resolve immediately if timeout is undefined', async () => {
      const promise = Promise.resolve('success')
      const result = await withTimeout(promise, undefined, 'test')

      expect(result).toBe('success')
    })

    it('should reject with timeout error if promise does not resolve in time', async () => {
      const promise = new Promise((resolve) => {
        // Never resolve
      })

      const timeoutPromise = withTimeout(promise, 1000, 'test operation')

      // Advance timers past the timeout
      vi.advanceTimersByTime(1500)

      await expect(timeoutPromise).rejects.toThrow('test operation timed out after 1000ms')
    })

    it('should reject with original error if promise rejects before timeout', async () => {
      const originalError = new Error('Original error')
      const promise = Promise.reject(originalError)

      await expect(withTimeout(promise, 5000, 'test')).rejects.toThrow('Original error')
    })

    it('should resolve when promise completes before timeout', async () => {
      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('done'), 500)
      })

      const wrappedPromise = withTimeout(promise, 10000, 'test')
      vi.advanceTimersByTime(600)
      const result = await wrappedPromise

      expect(result).toBe('done')
    })

    it('should reject with original error when promise rejects before timeout', async () => {
      const promise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('fail')), 500)
      })

      const timeoutPromise = withTimeout(promise, 10000, 'test')
      vi.advanceTimersByTime(600)
      await expect(timeoutPromise).rejects.toThrow('fail')
    })

    it('should preserve non-Error rejections', async () => {
      const promise = Promise.reject('string error')

      await expect(withTimeout(promise, 5000, 'test')).rejects.toThrow('string error')
    })

    it('should use custom label in error message', async () => {
      const promise = new Promise((resolve) => {
        // Never resolve
      })

      const timeoutPromise = withTimeout(promise, 2000, 'custom operation')

      vi.advanceTimersByTime(2500)

      await expect(timeoutPromise).rejects.toThrow('custom operation timed out after 2000ms')
    })

    it('should handle concurrent timeouts correctly', async () => {
      const fastPromise = Promise.resolve('fast')
      const slowPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('slow'), 2000)
      })

      // Create timeout-wrapped promises first
      const fastTimeoutPromise = withTimeout(fastPromise, 500, 'fast')
      const slowTimeoutPromise = withTimeout(slowPromise, 3000, 'slow')

      // Advance timers to trigger the slow promise resolution
      vi.advanceTimersByTime(2500)

      const [fastResult, slowResult] = await Promise.all([
        fastTimeoutPromise,
        slowTimeoutPromise,
      ])

      expect(fastResult).toBe('fast')
      expect(slowResult).toBe('slow')
    })
  })
})
