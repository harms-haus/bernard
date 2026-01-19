#!/usr/bin/env tsx
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
    await new Promise(resolve => setTimeout(resolve, 500))
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

  // Start LangGraph server
  startServer({
    port: 2024,
    nWorkers: 1,
    host: '0.0.0.0',
    cwd: __dirname,
    graphs: langgraphConfig.graphs
  }).then(() => {
    console.log('✅ Bernard Agent server started on port 2024')
  }).catch((error: Error) => {
    console.error('❌ Failed to start agent server:', error)
    process.exit(1)
  })
}

main()
