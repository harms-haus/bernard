import { Client } from '@langchain/langgraph-sdk'
import { addJob } from '../infra/worker-queue'
import { error, ok } from './response'

export interface AutoRenameBody {
  firstMessage?: string
  messages?: Array<{ type: string; content: unknown }>
}

export async function handleAutoRename(
  threadId: string,
  body: AutoRenameBody
) {
  let messages: Array<{ type: string; content: unknown }> = body.messages || []

  if (messages.length === 0) {
    const langgraphUrl = process.env['LANGGRAPH_API_URL'] ?? 'http://localhost:2024'
    const client = new Client({ apiUrl: langgraphUrl })

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, attempt * 500))
        const threadState = await client.threads.getState(threadId)
        const threadValues = threadState.values as Record<string, unknown> | undefined
        messages = (threadValues?.messages as Array<{ type: string; content: unknown }>) || []
        if (messages.length > 0) break
      } catch (e) {
        if (attempt === 2) {
          console.error('Failed to fetch thread state from LangGraph for auto-rename:', e)
        }
      }
    }
  }

  if (messages.length === 0) {
    return error('Could not retrieve thread messages', 400)
  }

  try {
    await addJob('thread-naming', { threadId, messages }, {
      jobId: `thread-naming-${threadId}`,
      deduplicationId: `thread-naming-${threadId}`,
    })

    return ok({
      success: true,
      threadId,
      message: 'Auto-rename job queued',
    })
  } catch {
    return error('Failed to queue auto-rename', 500)
  }
}
