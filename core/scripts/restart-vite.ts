#!/usr/bin/env tsx
/**
 * Vite restart wrapper script
 * Kills any existing Vite process on port 8810 and starts fresh
 */

import { execSync } from 'node:child_process'
import { spawn } from 'node:child_process'

// Kill any existing process on port 8810
try {
  execSync(`lsof -ti:8810 | xargs kill -9 2>/dev/null || fuser -k 8810/tcp 2>/dev/null || true`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  console.log('✅ Killed existing Vite process on port 8810')
} catch {
  // No process to kill, that's fine
}

// Wait a bit for port to be released
await new Promise(resolve => setTimeout(resolve, 500))

// Start Vite dev server
const viteProcess = spawn('./node_modules/.bin/vite', [], {
  cwd: process.cwd(),
  stdio: 'inherit',
})

viteProcess.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`Vite exited with code ${code}`)
  }
})
