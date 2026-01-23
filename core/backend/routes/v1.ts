import { Hono } from 'hono'
import { Client } from '@langchain/langgraph-sdk'
import { logger } from '../../src/lib/logging/logger'
import { ensureRequestId } from '../../src/lib/logging/logger'
import { getSession } from '../utils/auth'
import fs from 'fs'
import path from 'path'

const LANGGRAPH_API_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024'

const client = new Client({
  apiUrl: LANGGRAPH_API_URL,
})

const v1Routes = new Hono()

// POST /api/v1/chat/completions - OpenAI-compatible chat endpoint
v1Routes.post('/chat/completions', async (c) => {
  const requestId = ensureRequestId(c.req.header('x-request-id'))
  const reqLogger = logger.child({ requestId, component: 'chat-completions' })

  try {
    const body = await c.req.json()
    const { messages, model, thread_id, stream } = body as {
      messages: Array<{ role: string; content: string }>
      model: string
      thread_id?: string
      stream?: boolean
    }

    // Get user session to pass role to agent for tool filtering
    const session = await getSession(c)
    const userRole = session?.user?.role ?? 'guest'

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json(
        { error: 'messages is required and must be a non-empty array' },
        400
      )
    }

    let threadId = thread_id

    if (!threadId) {
      const thread = await client.threads.create()
      threadId = thread.thread_id
    }

    // Non-streaming: use create() + join()
    if (!stream) {
      const assistantId = model || 'bernard_agent'
      const run = await client.runs.create(
        threadId,
        assistantId,
        {
          input: { messages, userRole },
        } as any
      )
      // Wait for run to complete using join()
      const result = await client.runs.join(threadId, run.run_id)
      return c.json(result)
    }

    // Streaming: use stream() with proper event handling
    const runStream = client.runs.stream(
      threadId,
      model || 'bernard_agent',
      {
        input: { messages, userRole },
        streamMode: ['messages', 'updates', 'custom'] as const,
      } as any
    )

    const encoder = new TextEncoder()
    let messageCount = 0

    const responseStream = new ReadableStream({
      async start(controller) {
        let doneSent = false
        try {
          for await (const chunk of runStream) {
            const chunkAny = chunk as Record<string, unknown>
            const eventType = String(chunkAny.event || '')

            // Handle messages/complete events (contains the AI response)
            if (eventType === 'messages/complete' || eventType === 'messages') {
              const data = chunkAny.data as unknown[]
              if (Array.isArray(data)) {
                // Find AI message in the array
                for (const msg of data) {
                  const msgObj = msg as Record<string, unknown>
                  if (msgObj?.type === 'ai' && msgObj?.content) {
                    const content = Array.isArray(msgObj.content)
                      ? msgObj.content.map((c: Record<string, unknown>) => {
                        // Handle different content formats
                        if (typeof c === 'string') return c
                        return (c as Record<string, unknown>).text || (c as Record<string, unknown>).content || ''
                      }).join('')
                      : String(msgObj.content)

                    if (content) {
                      messageCount++
                      const sseData = JSON.stringify({
                        id: `chatcmpl-${Date.now()}-${messageCount}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: model || 'bernard_agent',
                        choices: [{
                          index: 0,
                          delta: { content },
                          finish_reason: null,
                        }],
                      })
                      controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
                    }
                  }
                }
              }
            }

            // Handle updates (tool calls, etc.)
            if (eventType === 'updates') {
              const updateData = chunkAny.data as Record<string, unknown>
              if (updateData?.steps) {
                const steps = updateData.steps as Array<Record<string, unknown>>
                for (const step of steps) {
                  if (step.type === 'tool' && step.tool_calls) {
                    const toolCalls = step.tool_calls as Array<Record<string, unknown>>
                    for (const toolCall of toolCalls) {
                      const sseData = JSON.stringify({
                        id: `chatcmpl-${Date.now()}-tool-${toolCall.id}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: model || 'bernard_agent',
                        choices: [{
                          index: 0,
                          delta: {
                            role: 'assistant',
                            tool_calls: [{
                              id: String(toolCall.id || ''),
                              type: 'function',
                              function: {
                                name: String(toolCall.name || ''),
                                arguments: JSON.stringify(toolCall.args || {}),
                              },
                            }],
                          },
                          finish_reason: null,
                        }],
                      })
                      controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
                    }
                  }
                }
              }
            }

            // Handle done event
            if (eventType === 'done' || chunkAny.status === 'done') {
              const sseData = JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model || 'bernard_agent',
                choices: [{
                  index: 0,
                  delta: {},
                  finish_reason: 'stop',
                }],
              })
              controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              doneSent = true
              break
            }
          }

          if (!doneSent) {
            const sseData = JSON.stringify({
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model || 'bernard_agent',
              choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop',
              }],
            })
            controller.enqueue(encoder.encode(`data: ${sseData}\n\n`))
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          }
        } catch (error) {
          reqLogger.error({ error }, 'Streaming error')
          if (!doneSent) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`))
          }
        } finally {
          controller.close()
        }
      }
    })

    return c.body(responseStream, 200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    })
  } catch (error) {
    reqLogger.error({ error }, 'Chat completions error')
    return c.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : String(error) },
      500
    )
  }
})

async function getGraphsFromLangGraphServer(): Promise<string[]> {
  try {
    // Create client inside function for testability
    const client = new Client({
      apiUrl: LANGGRAPH_API_URL,
    })
    // Try to get assistants (SDK auto-creates one per graph)
    const assistants = await client.assistants.search({})
    // Return unique graph_ids from assistants
    return [...new Set(assistants.map((a) => a.graph_id))]
  } catch {
    return []
  }
}

function getGraphsFromConfig(): string[] {
  try {
    const langgraphJsonPath = path.join(process.cwd(), 'langgraph.json')
    const config = JSON.parse(fs.readFileSync(langgraphJsonPath, 'utf-8'))
    return Object.keys(config.graphs || {})
  } catch {
    return []
  }
}

// OPTIONS /api/v1/models - CORS preflight
v1Routes.options('/models', async (c) => {
  return c.body(null, 204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  })
})

// GET /api/v1/models - OpenAI-compatible models endpoint
v1Routes.get('/models', async (c) => {
  try {
    // Get available graphs - first try LangGraph server, fall back to config
    let graphIds = await getGraphsFromLangGraphServer()
    if (graphIds.length === 0) {
      graphIds = getGraphsFromConfig()
    }

    // Ensure bernard_agent is always available (the main agent)
    if (!graphIds.includes('bernard_agent')) {
      graphIds.unshift('bernard_agent')
    }

    // Build models list in OpenAI-compatible format
    const models = graphIds.map((id) => ({
      id,
      object: 'model',
      created: Date.now() / 1000,
      owned_by: 'bernard',
    }))

    return c.json(
      { object: 'list', data: models },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
        },
      }
    )
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Models endpoint error')
    return c.json(
      { error: (error as Error).message || 'Failed to list models' },
      500
    )
  }
})

export default v1Routes
