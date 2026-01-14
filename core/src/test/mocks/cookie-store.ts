import { vi } from 'vitest'

export interface CookieStore {
  get: (name: string) => { value: string } | undefined
  set: (name: string, value: string, options?: CookieOptions) => void
  delete: (name: string) => void
}

export interface CookieOptions {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  maxAge?: number
  expires?: Date
  path?: string
  domain?: string
}

export function createMockCookieStore(
  initialCookies: Record<string, string> = {}
): CookieStore {
  const cookies = new Map<string, string>(Object.entries(initialCookies))
  const setCalls: Array<{ name: string; value: string; options?: CookieOptions }> = []
  const deleteCalls: string[] = []

  const store: CookieStore = {
    get: vi.fn((name: string) => {
      const value = cookies.get(name)
      return value !== undefined ? { value } : undefined
    }),

    set: vi.fn((name: string, value: string, options?: CookieOptions) => {
      cookies.set(name, value)
      setCalls.push({ name, value, options })
    }),

    delete: vi.fn((name: string) => {
      cookies.delete(name)
      deleteCalls.push(name)
    }),
  }

  store.get = Object.assign(store.get, {
    getSetHistory: () => [...setCalls],
    getDeleteHistory: () => [...deleteCalls],
    getCookieValue: (name: string) => cookies.get(name),
    hasCookie: (name: string) => cookies.has(name),
    setCookie: (name: string, value: string) => cookies.set(name, value),
    clearAll: () => {
      cookies.clear()
      setCalls.length = 0
      deleteCalls.length = 0
    },
    getAll: () => Object.fromEntries(cookies),
  }) as CookieStore['get'] & {
    getSetHistory(): Array<{ name: string; value: string; options?: CookieOptions }>
    getDeleteHistory(): string[]
    getCookieValue(name: string): string | undefined
    hasCookie(name: string): boolean
    setCookie(name: string, value: string): void
    clearAll(): void
    getAll(): Record<string, string>
  }

  return store
}

export function createCookieStoreMock() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }
}

export function createCookieStoreForScenario(scenario: 'authenticated' | 'unauthenticated' | 'admin') {
  switch (scenario) {
    case 'authenticated':
      return createMockCookieStore({
        bernard_session: 'valid-session-token-12345',
      })

    case 'unauthenticated':
      return createMockCookieStore({})

    case 'admin':
      return createMockCookieStore({
        bernard_session: 'admin-session-token',
        bernard_admin_session: 'admin-key-12345',
      })

    default:
      return createMockCookieStore({})
  }
}
