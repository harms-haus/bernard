import { vi } from 'vitest'

let uuidCounter = 0

export function resetUUIDCounter() {
  uuidCounter = 0
}

export interface MockCrypto {
  randomUUID: () => string
  getRandomValues: (array: Uint8Array) => void
  subtle: {
    encrypt: ReturnType<typeof vi.fn>
    decrypt: ReturnType<typeof vi.fn>
    digest: ReturnType<typeof vi.fn>
    sign: ReturnType<typeof vi.fn>
    verify: ReturnType<typeof vi.fn>
    deriveKey: ReturnType<typeof vi.fn>
    importKey: ReturnType<typeof vi.fn>
    exportKey: ReturnType<typeof vi.fn>
  }
}

export function createMockCrypto(): MockCrypto {
  return {
    randomUUID: vi.fn(() => {
      uuidCounter++
      return `test-uuid-${uuidCounter.toString().padStart(4, '0')}`
    }),

    getRandomValues: vi.fn((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
      }
    }),

    subtle: {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      digest: vi.fn(),
      sign: vi.fn(),
      verify: vi.fn(),
      deriveKey: vi.fn(),
      importKey: vi.fn(),
      exportKey: vi.fn(),
    },
  }
}

export function createDeterministicMockCrypto(fixedUUID: string = 'fixed-uuid-1234'): MockCrypto {
  let callCount = 0

  return {
    randomUUID: vi.fn(() => {
      callCount++
      return `${fixedUUID}-${callCount}`
    }),

    getRandomValues: vi.fn((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = (callCount + i) % 256
      }
    }),

    subtle: {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      digest: vi.fn(),
      sign: vi.fn(),
      verify: vi.fn(),
      deriveKey: vi.fn(),
      importKey: vi.fn(),
      exportKey: vi.fn(),
    },
  }
}

export function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString('base64')
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function createTestCodeVerifier(length: number = 64): string {
  const array = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    array[i] = i % 256
  }
  return base64UrlEncode(array)
}

export function createTestState(length: number = 32): string {
  const array = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    array[i] = (i * 2) % 256
  }
  return base64UrlEncode(array)
}
