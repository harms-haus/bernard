import { beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { resetSettingsManager } from '@/lib/config/appSettings'
import { resetSettingsStore } from '@/lib/config/settingsStore'
import { resetOAuth } from '@/lib/auth/oauth'

const TEST_DIR = path.join(process.cwd(), 'test-temp')
const LOGS_DIR = path.join(TEST_DIR, 'logs')
const PIDS_DIR = path.join(TEST_DIR, 'pids')

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true })
  }
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true })
  }
  if (!fs.existsSync(PIDS_DIR)) {
    fs.mkdirSync(PIDS_DIR, { recursive: true })
  }

  vi.stubEnv('LOG_DIR', LOGS_DIR)
  vi.stubEnv('TZ', 'America/Chicago')
  // BetterAuth requires a secret, stub one for tests
  vi.stubEnv('BETTER_AUTH_SECRET', 'Cz+yjqf9nUVK2xa5lMgQEAIkeuDbZwvrct9IKXyPaJw=')
})

afterEach(() => {
  vi.unstubAllEnvs()
  // Reset singleton instances after each test
  resetSettingsManager()
  resetSettingsStore()
  resetOAuth()
})

vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    pid: 12345,
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
  }),
  execSync: vi.fn().mockReturnValue(''),
  exec: vi.fn(),
  execFile: vi.fn(),
  spawnSync: vi.fn(),
}))

const originalKill = process.kill

beforeEach(() => {
  process.kill = vi.fn().mockReturnValue(true) as any
})

afterEach(() => {
  process.kill = originalKill
})

export {}
