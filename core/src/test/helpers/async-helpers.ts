import { vi, expect } from 'vitest'

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const result = await condition()
    if (result) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error(`Timeout: Condition not met within ${timeout}ms`)
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delay?: number; shouldRetry?: (error: Error) => boolean } = {}
): Promise<T> {
  const { maxAttempts: rawMaxAttempts = 3, delay = 1000, shouldRetry = () => true } = options
  const maxAttempts = Math.max(1, rawMaxAttempts)

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError
      }

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // This line is unreachable when maxAttempts >= 1, but satisfies TypeScript
  throw lastError ?? new Error('Retry failed')
}

export function mockDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
