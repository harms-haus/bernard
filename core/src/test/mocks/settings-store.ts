import { vi } from 'vitest'

export function createMockSettingsStore() {
  const mock = {
    getAll: vi.fn(),
    getServices: vi.fn(),
    setServices: vi.fn(),
    getModels: vi.fn(),
    setModels: vi.fn(),
    getBackups: vi.fn(),
    setBackups: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  }

  mock.getAll.mockResolvedValue({})
  mock.getServices.mockResolvedValue({})
  mock.setServices.mockResolvedValue({})
  mock.getModels.mockResolvedValue({
    defaultUtility: 'llama3-8b-8192',
    defaultReasoning: 'deepseek-r1',
    defaultOutput: 'llama3-8b-8192',
  })
  mock.setModels.mockResolvedValue({})
  mock.getBackups.mockResolvedValue([])
  mock.setBackups.mockResolvedValue([])
  mock.get.mockResolvedValue(null)
  mock.set.mockResolvedValue(undefined)

  return mock
}

export type MockSettingsStore = ReturnType<typeof createMockSettingsStore>
