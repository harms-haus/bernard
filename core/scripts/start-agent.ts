#!/usr/bin/env bun
import { startServer } from '@langchain/langgraph-api/server'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.join(path.dirname(__filename), '..')

async function killExistingProcess(): Promise<void> {
  // Kill any existing process on port 2024
  try {
    const { execSync } = await import('node:child_process')
    execSync(`lsof -ti:2024 | xargs kill -9 2>/dev/null || fuser -k 2024/tcp 2>/dev/null || true`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    console.log('✅ Killed existing Bernard Agent process on port 2024')
    // Wait longer to ensure port is released and old process fully terminated
    await new Promise(resolve => setTimeout(resolve, 2000))
  } catch {
    // No process to kill, that's fine
  }
}

// Check if this is a restart
const isRestart = process.argv.includes('restart')

async function main() {
  if (isRestart) {
    await killExistingProcess()
  }

  // Load langgraph.json
  const langgraphConfig = JSON.parse(
    readFileSync(path.join(__dirname, 'langgraph.json'), 'utf-8')
  )

  try {
    await startServer({
      port: 2024,
      nWorkers: 1,
      host: '0.0.0.0',
      cwd: __dirname,
      graphs: langgraphConfig.graphs
    })
    console.log('✅ Bernard Agent server started on port 2024')
  } catch (error) {
    console.error('❌ Failed to start agent server:', error)
    process.exit(1)
  }

  if (isRestart) {
    console.log('⏳ Waiting for agent to be ready...')
    let attempts = 0
    const maxAttempts = 30
    const readyTimeoutMs = 1000
    const retryDelayMs = 500

    while (attempts < maxAttempts) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), readyTimeoutMs)

        const response = await fetch('http://127.0.0.1:2024/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assistant_id: 'bernard_agent',
            input: { messages: [] }
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          await response.json()
          console.log('✅ Agent is ready and responding')
          break
        }
      } catch {
      }
      attempts++
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }

    if (attempts >= maxAttempts) {
      const totalWaitTime = (maxAttempts * (readyTimeoutMs + retryDelayMs)) / 1000
      console.error(`❌ Agent failed to become ready after ${totalWaitTime} seconds`)
      process.exit(1)
    }
  }
}

main()
