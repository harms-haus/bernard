import { Hono } from 'hono'
import { Client } from '@langchain/langgraph-sdk'
import { z } from 'zod'
import { logger } from '../../src/lib/logging/logger'
import { ensureRequestId } from '../../src/lib/logging/logger'
import { getSession } from '../utils/auth'
import { createInvalidRequestError, createInternalError } from '../utils/errors'
import fs from 'fs'
import path from 'path'

const LANGGRAPH_API_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024'

const client = new Client({
  apiUrl: LANGGRAPH_API_URL,
})

const v1Routes = new Hono()

const ChatCompletionRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.union([z.string(), z.array(z.any())]).refine((val) => {
      const contentStr = typeof val === 'string' ? val : val.map((c) => typeof c === 'string' ? c : JSON.stringify(c)).join('')
      return contentStr && contentStr.length > 0
    }, { message: 'content must be non-empty' }),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
  })).min(1, { message: 'messages must contain at least one message' }),

  model: z.string().optional(),
  thread_id: z.string().regex(/^[a-zA-Z0-9-_]+$/).optional(),
  stream: z.boolean().default(false),

  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),

  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  n: z.number().int().min(1).max(128).optional(),
})

// POST /api/v1/chat/completions - OpenAI-compatible chat endpoint
v1Routes.post('/chat/completions', async (c) => {
  const requestId = ensureRequestId(c.req.header('x-request-id'))
  const reqLogger = logger.child({ requestId, component: 'chat-completions' })

  try {
    const body = await c.req.json()

    const validated = ChatCompletionRequestSchema.parse(body)

    const {
      messages,
      model,
      thread_id,
      stream,
      temperature,
      max_tokens,
      max_completion_tokens,
      top_p,
      presence_penalty,
      frequency_penalty,
      stop,
      n,
    } = validated

    const session = await getSession(c)
    const userRole = session?.user?.role ?? 'guest'

    if (presence_penalty !== undefined) {
      return c.json(
        createInvalidRequestError('presence_penalty parameter is not supported', 'presence_penalty'),
        400
      )
    }

    if (frequency_penalty !== undefined) {
      return c.json(
        createInvalidRequestError('frequency_penalty parameter is not supported', 'frequency_penalty'),
        400
      )
    }

    if (stop !== undefined) {
      return c.json(
        createInvalidRequestError('stop parameter is not supported', 'stop'),
        400
      )
    }

    if (n !== undefined && n !== 1) {
      return c.json(
        createInvalidRequestError('Only n=1 is supported', 'n'),
        400
      )
    }

    let threadId = thread_id

    if (!threadId) {
      const thread = await client.threads.create()
      threadId = thread.thread_id
    }

    const agentInput: Record<string, unknown> = {
      messages,
      userRole,
    }

    if (temperature !== undefined) {
      agentInput.temperature = temperature
    }

    if (max_completion_tokens !== undefined) {
      agentInput.maxTokens = max_completion_tokens
    } else if (max_tokens !== undefined) {
      agentInput.maxTokens = max_tokens
    }

    if (top_p !== undefined) {
      agentInput.topP = top_p
    }

    // Non-streaming: use create() + join()
    if (!stream) {
      const assistantId = model || 'bernard_agent'
      const run = await client.runs.create(
        threadId,
        assistantId,
        {
          input: agentInput,
        } as any
      )
      // Wait for run to complete using join()
      const result = await client.runs.join(threadId, run.run_id) as {
        messages?: Array<{ type: string; content: unknown; tool_calls?: unknown[]; id?: string }>
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      }

      // Transform to OpenAI format
      const completionId = `chatcmpl-${Date.now()}`
      const created = Math.floor(Date.now() / 1000)

      // Extract final assistant message from run result
      const finalMessage = result.messages?.find((m) => m.type === 'ai')

      // Extract content from AI message (can be string or array)
      let content = ''
      if (finalMessage?.content) {
        if (typeof finalMessage.content === 'string') {
          content = finalMessage.content
        } else if (Array.isArray(finalMessage.content)) {
          // Extract text from content parts
          content = finalMessage.content
            .map((c: any) => {
              if (typeof c === 'string') return c
              return c.text || c.content || ''
            })
            .join('')
        }
      }

      // Extract tool calls if present
      const toolCalls = finalMessage?.tool_calls || []

      // Build OpenAI completion response
      const response = {
        id: completionId,
        object: 'chat.completion',
        created,
        model: assistantId,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content,
            tool_calls: toolCalls.length > 0 ? toolCalls.map((tc: any) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
              },
            })) : undefined,
            refusal: null,
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: result.usage?.prompt_tokens ?? 0,
          completion_tokens: result.usage?.completion_tokens ?? 0,
          total_tokens: result.usage?.total_tokens ?? 0,
          prompt_tokens_details: {
            cached_tokens: 0,
            audio_tokens: 0,
          },
          completion_tokens_details: {
            reasoning_tokens: 0,
            audio_tokens: 0,
            accepted_prediction_tokens: 0,
            rejected_prediction_tokens: 0,
          },
        },
        service_tier: 'default',
      }

      return c.json(response)
    }

    // Streaming: use stream() with proper event handling
    const runStream = client.runs.stream(
      threadId,
      model || 'bernard_agent',
      {
        input: agentInput,
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

    if (error instanceof z.ZodError) {
      return c.json(
        createInvalidRequestError(
          'Invalid request body',
          undefined,
          { validation_errors: error.issues }
        ),
        400
      )
    }

    return c.json(
      createInternalError(error instanceof Error ? error.message : String(error)),
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
