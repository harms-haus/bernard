#!/usr/bin/env tsx
/**
 * Unified Worker Queue Worker
 *
 * Processes all background jobs:
 * - Thread naming
 * - Service actions (start/stop/restart/check)
 *
 * Run this alongside the main application.
 */

import { startWorker } from '../src/lib/infra/worker-queue'

console.log('[WorkerQueue] Starting unified worker queue worker...')

startWorker()
  .then(() => {
    console.log('[WorkerQueue] Unified worker queue worker started')
  })
  .catch((error: Error) => {
    console.error('[WorkerQueue] Failed to start:', error)
    process.exit(1)
  })

// Keep the process running
process.on('SIGINT', async () => {
  console.log('[WorkerQueue] Shutting down...')
  const { stopWorker } = await import('../src/lib/infra/worker-queue')
  await stopWorker()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('[WorkerQueue] Shutting down...')
  const { stopWorker } = await import('../src/lib/infra/worker-queue')
  await stopWorker()
  process.exit(0)
})
