#!/usr/bin/env tsx
import { startServer } from '@langchain/langgraph-api/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = join(__filename, '..')

// Load langgraph.json
const langgraphConfig = JSON.parse(
  readFileSync(join(__dirname, '..', 'langgraph.json'), 'utf-8')
)

// Start LangGraph server
startServer({
  port: 2024,
  nWorkers: 1,
  host: '0.0.0.0',
  cwd: process.cwd(),
  graphs: langgraphConfig.graphs
}).then(() => {
  console.log('✅ Bernard Agent server started on port 2024')
}).catch((error: Error) => {
  console.error('❌ Failed to start agent server:', error)
  process.exit(1)
})
