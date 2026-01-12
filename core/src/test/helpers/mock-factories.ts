import { vi } from 'vitest'

export function createMockFn<T extends (...args: any[]) => any>(
  implementation?: T
): ReturnType<typeof vi.fn<T>> {
  return implementation ? vi.fn(implementation) : vi.fn()
}

export function createAsyncMockFn<T extends (...args: any[]) => Promise<any>>(
  implementation?: T
): ReturnType<typeof vi.fn<T>> {
  return implementation ? vi.fn(implementation) : vi.fn()
}

export function mockResolvedValue<T>(value: T) {
  return vi.fn().mockResolvedValue(value)
}

export function mockRejectedValue(error: Error | string) {
  const err = typeof error === 'string' ? new Error(error) : error
  return vi.fn().mockRejectedValue(err)
}
