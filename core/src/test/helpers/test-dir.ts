import fs from 'node:fs/promises'
import path from 'node:path'

const TEST_DIR = path.join(process.cwd(), 'test-temp')
const LOGS_DIR = path.join(TEST_DIR, 'logs')
const PIDS_DIR = path.join(TEST_DIR, 'pids')

export async function createTestDir(): Promise<void> {
  await fs.mkdir(LOGS_DIR, { recursive: true })
  await fs.mkdir(PIDS_DIR, { recursive: true })
}

export async function cleanupTestDir(): Promise<void> {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  } catch {
    // Ignore if directory doesn't exist
  }
}

export function getTestDir(): string {
  return TEST_DIR
}

export function getLogsDir(): string {
  return LOGS_DIR
}

export function getPidsDir(): string {
  return PIDS_DIR
}
