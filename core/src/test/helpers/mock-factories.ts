// core/src/test/helpers/mock-factories.ts
import { vi } from 'vitest';

// ============================================================================
// Async Mock Factory
// ============================================================================

export function createAsyncMock<T extends (...args: unknown[]) => Promise<unknown>>(
  implementation?: (...args: Parameters<T>) => ReturnType<T>
) {
  return vi.fn(implementation);
}

// ============================================================================
// Resolved Value Mock Factory
// ============================================================================

export function mockResolvedValue<T>(value: T): () => Promise<T> {
  return () => Promise.resolve(value);
}

// ============================================================================
// Rejected Value Mock Factory
// ============================================================================

export function mockRejectedValue(error: Error): () => Promise<never> {
  return () => Promise.reject(error);
}

// ============================================================================
// Spy Factory
// ============================================================================

export function createSpy<T extends (...args: unknown[]) => unknown>(
  implementation?: (...args: Parameters<T>) => ReturnType<T>
) {
  const obj: Record<string, () => unknown> = { mockFn: () => { } };
  return vi.spyOn(obj, 'mockFn').mockImplementation(
    implementation as (...args: unknown[]) => unknown
  );
}

// ============================================================================
// Mock Function Factory
// ============================================================================

export function createMockFn<T extends (...args: unknown[]) => unknown>(): ReturnType<typeof vi.fn<T>> {
  return vi.fn();
}

// ============================================================================
// Once Call Mock Factory
// ============================================================================

export function mockOnce<T>(value: T): () => Promise<T> {
  let called = false;
  return () => {
    if (called) {
      return Promise.reject(new Error('mockOnce: already called'));
    }
    called = true;
    return Promise.resolve(value);
  };
}

// ============================================================================
// Timeout Mock Factory
// ============================================================================

export function mockWithTimeout<T>(
  value: T,
  delayMs = 100
): () => Promise<T> {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return value;
  };
}
