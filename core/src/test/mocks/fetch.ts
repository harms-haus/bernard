/**
 * Fetch API mock helpers for Vitest tests.
 *
 * Provides utilities for mocking global fetch API with controlled responses.
 */

import { vi } from 'vitest'

/**
 * Mock fetch response.
 */
export interface MockFetchResponse {
  ok?: boolean
  status?: number
  statusText?: string
  headers?: Record<string, string>
  body?: any
  json?: any
}

/**
 * Create a mock Response object.
 */
export function createMockResponse(options: MockFetchResponse = {}): Response {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    headers = {},
    body = null,
    json = null,
  } = options

  let bodyUsed = false

  const response = {
    ok,
    status,
    statusText,
    headers: new Headers(headers),
    get bodyUsed() { return bodyUsed },
    set bodyUsed(value: boolean) { bodyUsed = value },

    async text() {
      bodyUsed = true
      if (json !== null) return JSON.stringify(json)
      return body !== null ? String(body) : ''
    },

    async json() {
      bodyUsed = true
      return json !== null ? json : body !== null ? JSON.parse(body) : null
    },

    clone() {
      return createMockResponse({ ok, status, statusText, headers, body, json })
    },
  } as Response

  return response
}

/**
 * Mock fetch with controlled responses.
 *
 * Usage:
 * ```typescript
 * const mockFetch = createMockFetch()
 *
 * // Set a response for a specific URL (returns every time)
 * mockFetch.setResponse('http://api.example.com/data', { json: { result: 'success' } })
 * const response1 = await mockFetch.fetch('http://api.example.com/data')
 * expect(response1.status).toBe(200)
 *
 * // Or queue responses for sequential calls (FIFO)
 * mockFetch.queueResponse({ json: { result: 'first' } })
 * mockFetch.queueResponse({ json: { result: 'second' } })
 * const response2 = await mockFetch.fetch('http://any-url.com')
 * const response3 = await mockFetch.fetch('http://any-url.com')
 * expect(await response2.json()).toEqual({ result: 'first' })
 * expect(await response3.json()).toEqual({ result: 'second' })
 * ```
 */
export function createMockFetch() {
  const calls: Array<{ url: string; options?: RequestInit }> = []
  const responses: Map<string, MockFetchResponse> = new Map()
  const responseQueue: MockFetchResponse[] = []
  let defaultResponse: MockFetchResponse = {}

  const mockFn = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
    calls.push({ url, options })

    // Check for queued responses
    if (responseQueue.length > 0) {
      return createMockResponse(responseQueue.shift())
    }

    // Check for URL-specific response
    if (responses.has(url)) {
      return createMockResponse(responses.get(url))
    }

    // Return default response
    return createMockResponse(defaultResponse)
  })

  return {
    /** Mocked fetch function */
    fetch: mockFn,

    /** Set response for specific URL */
    setResponse: (url: string, response: MockFetchResponse) => {
      responses.set(url, response)
    },

    /** Queue response for next fetch call (FIFO) */
    queueResponse: (response: MockFetchResponse) => {
      responseQueue.push(response)
    },

    /** Set default response for all unmatched URLs */
    setDefaultResponse: (response: MockFetchResponse) => {
      defaultResponse = response
    },

    /** Get all fetch calls */
    getCalls: () => calls,

    /** Clear all calls and responses */
    reset: () => {
      mockFn.mockClear()
      calls.length = 0
      responses.clear()
      responseQueue.length = 0
      defaultResponse = {}
    },

    /** Verify fetch was called with specific URL */
    wasCalledWith: (url: string, options?: RequestInit) => {
      return calls.some(c => {
        if (c.url !== url) return false
        if (options && !deepEqual(c.options, options)) return false
        return true
      })
    },

    /** Verify fetch was called specific number of times */
    callCount: () => mockFn.mock.calls.length,
  }
}

/**
 * Deep equality check for objects.
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object' || a === null || b === null) return false

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (!keysB.includes(key)) return false
    if (!deepEqual(a[key], b[key])) return false
  }

  return true
}

/**
 * Global fetch mock that can be enabled/disabled.
 *
 * Usage in beforeEach:
 * ```typescript
 * const mockFetch = enableGlobalMockFetch()
 * mockFetch.setResponse('http://api.example.com/data', { json: { result: 'success' } })
 * ```
 *
 * Usage in afterEach:
 * ```typescript
 * disableGlobalMockFetch()
 * ```
 */
let globalMock: ReturnType<typeof createMockFetch> | null = null
let originalFetch: typeof globalThis.fetch | null = null

export function enableGlobalMockFetch() {
  if (globalMock) return globalMock

  originalFetch = globalThis.fetch
  globalMock = createMockFetch()

  globalThis.fetch = globalMock.fetch as any

  return globalMock
}

export function disableGlobalMockFetch() {
  if (!globalMock) return

  globalMock.reset()
  globalThis.fetch = originalFetch as any

  globalMock = null
  originalFetch = null
}

export function getGlobalMockFetch() {
  return globalMock
}
