import { NextRequest, NextResponse } from 'next/server'
import { addUtilityJob } from '../infra/queue'
import { error, ok, badRequest } from './response'

export interface AutoRenameBody {
  firstMessage?: string
  messages?: Array<{ type: string; content: unknown }>
}

export async function handleAutoRename(
  threadId: string,
  body: AutoRenameBody
): Promise<NextResponse> {
  if (!body.firstMessage && (!body.messages || body.messages.length === 0)) {
    return badRequest('firstMessage or messages is required')
  }

  let messageToUse = body.firstMessage
  if (!messageToUse && body.messages) {
    const firstHumanMessage = body.messages.find(m => m.type === 'human')
    if (firstHumanMessage) {
      messageToUse = typeof firstHumanMessage.content === 'string'
        ? firstHumanMessage.content
        : JSON.stringify(firstHumanMessage.content)
    }
  }

  if (!messageToUse) {
    return error('Could not extract first human message', 400)
  }

  try {
    await addUtilityJob('thread-naming', { threadId, message: messageToUse }, {
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
