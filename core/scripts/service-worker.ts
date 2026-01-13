#!/usr/bin/env tsx
/**
 * Service Queue Worker
 *
 * Processes service start/stop/restart jobs.
 * Run this alongside the main application.
 */

import { startServiceWorker } from '../src/lib/infra/service-queue/worker'

console.log('[ServiceWorker] Starting service queue worker...')

startServiceWorker()
  .then(() => {
    console.log('[ServiceWorker] Service queue worker started')
  })
  .catch((error: Error) => {
    console.error('[ServiceWorker] Failed to start:', error)
    process.exit(1)
  })

// Keep the process running
process.on('SIGINT', () => {
  console.log('[ServiceWorker] Shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[ServiceWorker] Shutting down...')
  process.exit(0)
})
