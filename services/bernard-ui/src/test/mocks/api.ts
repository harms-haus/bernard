import { vi } from 'vitest'

export function mockFetch() {
  const mock = vi.fn() as ReturnType<typeof vi.fn>

  globalThis.fetch = mock as any

  return {
    mock,
    mockResolvedResponse<T>(data: T, ok: boolean = true) {
      mock.mockResolvedValue({
        ok,
        status: ok ? 200 : 400,
        json: async () => data,
        body: new ReadableStream(),
      })
    },
    mockRejectedResponse(error: Error | string) {
      const err = typeof error === 'string' ? new Error(error) : error
      mock.mockRejectedValue(err)
    },
    reset() {
      mock.mockClear()
    },
  }
}
