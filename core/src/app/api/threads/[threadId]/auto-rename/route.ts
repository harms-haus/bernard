import { NextRequest, NextResponse } from "next/server"
import { addUtilityJob } from "@/lib/infra/queue"
import { Client } from "@langchain/langgraph-sdk"

/**
 * POST /api/threads/:threadId/auto-rename
 *
 * Auto-rename a thread based on the first user message.
 * Queues a background job to generate a title using the utility model.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params

  try {
    const body = await request.json()
    const { firstMessage, messages } = body

    if (!firstMessage && (!messages || messages.length === 0)) {
      return NextResponse.json(
        { error: "firstMessage or messages is required" },
        { status: 400 }
      )
    }

    console.log(`[AutoRename] Starting auto-rename for thread: ${threadId}`)

    // Extract first human message if messages array provided
    let messageToUse = firstMessage
    if (!messageToUse && messages && Array.isArray(messages)) {
      const firstHumanMessage = messages.find((m: any) => m.type === "human")
      if (firstHumanMessage) {
        messageToUse = typeof firstHumanMessage.content === "string"
          ? firstHumanMessage.content
          : JSON.stringify(firstHumanMessage.content)
      }
    }

    if (!messageToUse) {
      return NextResponse.json(
        { error: "Could not extract first human message" },
        { status: 400 }
      )
    }

    // Queue the naming job (fire-and-forget)
    await addUtilityJob("thread-naming", {
      threadId,
      message: messageToUse,
    }, {
      jobId: `thread-naming-${threadId}`,
      deduplicationId: `thread-naming-${threadId}`,
    })

    console.log(`[AutoRename] Job queued for thread: ${threadId}`)

    // Return immediately - the job runs in background
    return NextResponse.json({
      success: true,
      threadId,
      message: "Auto-rename job queued",
    })
  } catch (error) {
    console.error(`[AutoRename] Failed to queue auto-rename:`, error)
    return NextResponse.json(
      { error: "Failed to queue auto-rename" },
      { status: 500 }
    )
  }
}
