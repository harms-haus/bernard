/**
 * Child process mock factory for testing
 */

import { vi } from 'vitest'

export function createSpawnMock() {
  return vi.fn().mockReturnValue({
    pid: 12345,
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
  })
}

export function createExecSyncMock(returnValue: string = '') {
  return vi.fn().mockReturnValue(returnValue)
}
