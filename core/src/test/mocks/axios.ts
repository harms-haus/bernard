/**
 * HTTP client mocks (axios-like)
 */

import { vi } from 'vitest'

export function createAxiosMock() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  }
}

export function mockResponse<T>(data: T, status: number = 200) {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {},
  }
}

export function mockErrorResponse(message: string, status: number = 500) {
  return {
    response: {
      data: { message },
      status,
      statusText: 'Error',
      headers: {},
      config: {},
    },
  }
}
