import { vi } from 'vitest'

export function mockRouter() {
  return {
    push: vi.fn().mockResolvedValue(true),
    replace: vi.fn().mockResolvedValue(true),
    back: vi.fn().mockResolvedValue(true),
    pathname: '/test',
    search: '',
    hash: '',
  }
}
