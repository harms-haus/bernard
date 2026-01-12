#!/usr/bin/env tsx
/**
 * Utility Queue Worker
 *
 * Processes background jobs like thread naming.
 * Run this alongside the main application.
 */

import { startUtilityWorker } from '../src/lib/infra/queue'

console.log('[UtilityWorker] Starting utility queue worker...')

startUtilityWorker()
  .then(() => {
    console.log('[UtilityWorker] Utility queue worker started')
  })
  .catch((error: Error) => {
    console.error('[UtilityWorker] Failed to start:', error)
    process.exit(1)
  })

// Keep the process running
process.on('SIGINT', () => {
  console.log('[UtilityWorker] Shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[UtilityWorker] Shutting down...')
  process.exit(0)
})
