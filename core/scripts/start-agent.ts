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
  graphs: {
    agent: './src/agents/shared/src/react-agent/graph.ts:graph',
    memory_agent: './src/agents/shared/src/memory-agent/graph.ts:graph',
    research_agent: './src/agents/shared/src/research-agent/retrieval-graph/graph.ts:graph',
    research_index_graph: './src/agents/shared/src/research-agent/index-graph/graph.ts:graph',
    retrieval_agent: './src/agents/shared/src/retrieval-agent/graph.ts:graph',
    bernard: './src/agents/bernard/bernard.agent.ts:agent'
  }
}).then(() => {
  console.log('✅ Bernard Agent server started on port 2024')
}).catch((error: Error) => {
  console.error('❌ Failed to start agent server:', error)
  process.exit(1)
})
