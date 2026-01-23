import { Hono } from 'hono'
import { Client } from '@langchain/langgraph-sdk'
import { getSession } from '../utils/auth'

const LANGGRAPH_API_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024'

const client = new Client({
  apiUrl: LANGGRAPH_API_URL,
})

const bernardStreamRoutes = new Hono()

// POST /api/bernard/stream - Stream Bernard agent responses
bernardStreamRoutes.post('/stream', async (c) => {
  try {
    const body = await c.req.json()
    const { threadId, messages } = body as {
      threadId: string
      messages: Array<{ role: string; content: string }>
    }

    // Get user session to pass role to agent for tool filtering
    const session = await getSession(c)
    const userRole = session?.user?.role ?? 'guest'

    if (!threadId) {
      return c.json({ error: 'threadId is required' }, 400)
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: 'messages is required and must be a non-empty array' }, 400)
    }

    // Validate each message has required structure
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (!msg || typeof msg !== 'object') {
        return c.json({ error: `messages[${i}] must be an object` }, 400)
      }
      if (typeof msg.role !== 'string' || !msg.role) {
        return c.json({ error: `messages[${i}].role must be a non-empty string` }, 400)
      }
      if (typeof msg.content !== 'string') {
        return c.json({ error: `messages[${i}].content must be a string` }, 400)
      }
    }

    const runOptions = {
      input: { messages, userRole },
      streamMode: ['messages', 'updates', 'custom'] as const,
    } as any

    // Check thread status - if it has a pending run, use interrupt strategy
    let thread = await client.threads.get(threadId)
    if (thread.status === 'busy') {
      // Thread has a running task - use interrupt strategy to allow concurrent execution
      const runStream = client.runs.stream(
        threadId,
        'bernard_agent',
        {
          ...runOptions,
          multitaskStrategy: 'interrupt',
        }
      )

      return createStreamResponse(c, runStream)
    }

    // Check for any pending runs on this thread
    const runs = await client.runs.list(threadId)
    const pendingRun = runs.find(r => r.status === 'pending' || r.status === 'running')
    if (pendingRun) {
      // There's a pending run - use interrupt strategy
      const runStream = client.runs.stream(
        threadId,
        'bernard_agent',
        {
          ...runOptions,
          multitaskStrategy: 'interrupt',
        }
      )

      return createStreamResponse(c, runStream)
    }

    // Thread is idle - proceed normally
    const runStream = client.runs.stream(
      threadId,
      'bernard_agent',
      runOptions
    )

    return createStreamResponse(c, runStream)
  } catch (error) {
    console.error('Stream API error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

function createStreamResponse(c: any, runStream: AsyncIterable<Record<string, unknown>>) {
  const encoder = new TextEncoder()
  let messageCount = 0

  const responseStream = new ReadableStream({
    async start(controller) {
      let doneSent = false
      try {
        for await (const chunk of runStream) {
          const chunkAny = chunk as Record<string, unknown>
          const eventType = String(chunkAny.event || '')

          // Handle messages/partial events (token streaming)
          if (eventType === 'messages/partial') {
            const data = chunkAny.data as unknown[]
            if (Array.isArray(data)) {
              for (const msg of data) {
                const msgObj = msg as Record<string, unknown>
                const msgType = String(msgObj?.type || '')

                // Process only AI messages
                if (msgType === 'ai' && msgObj?.id) {
                  let content = ''
                  if (msgObj.content) {
                    content = Array.isArray(msgObj.content)
                      ? msgObj.content.map((c: Record<string, unknown>) => {
                          if (typeof c === 'string') return c
                          return (c as Record<string, unknown>).text || (c as Record<string, unknown>).content || ''
                        }).join('')
                      : String(msgObj.content)
                  }

                  if (content) {
                    messageCount++
                    const sseData = JSON.stringify({
                      event: 'message',
                      data: {
                        id: msgObj.id,
                        content,
                        type: 'ai',
                      },
                    })
                    controller.enqueue(encoder.encode(`event: message\ndata: ${sseData}\n\n`))
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
                      event: 'tool_call',
                      data: {
                        id: toolCall.id,
                        name: toolCall.name,
                        args: toolCall.args,
                      },
                    })
                    controller.enqueue(encoder.encode(`event: tool_call\ndata: ${sseData}\n\n`))
                  }
                }
              }
            }
          }

          // Handle done event
          if (eventType === 'done' || chunkAny.status === 'done') {
            controller.enqueue(encoder.encode(`event: done\ndata: {"event":"done"}\n\n`))
            doneSent = true
            break
          }
        }

        if (!doneSent) {
          controller.enqueue(encoder.encode(`event: done\ndata: {"event":"done"}\n\n`))
        }
      } catch (error) {
        console.error('Stream error:', error)
        if (!doneSent) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: (error as Error).message })}\n\n`))
        }
      } finally {
        controller.close()
      }
    },
  })

  return c.body(responseStream, 200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
}

export default bernardStreamRoutes
