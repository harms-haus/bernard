import { NextRequest, NextResponse } from 'next/server'
import { handleGetTasks, handlePostTaskAction, handleDeleteTask } from '@/lib/api/tasks'
import { requireAuth } from '@/lib/auth/server-helpers'
import { badRequest, error, ok } from '@/lib/api/response'
import { getTaskKeeper } from '@/lib/api/factory'
import { logger } from '@/lib/logging/logger'

export async function GET(request: NextRequest) {
  return handleGetTasks(request)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handlePostTaskAction(request, body)
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await requireAuth()
    if (!authUser) return NextResponse.json({ error: 'Session required' }, { status: 403 })

    const userId = authUser.user.id
    const taskId = request.nextUrl.searchParams.get('taskId')

    if (!taskId) {
      return badRequest('taskId is required')
    }

    const keeper = getTaskKeeper()
    const task = await keeper.getTask(taskId)

    if (!task) {
      return error('Task not found', 404)
    }
    if (task.userId !== userId) {
      return error('Forbidden', 403)
    }

    const success = await keeper.deleteTask(taskId)
    if (!success) {
      return error('Cannot delete task', 400)
    }

    return ok({ success: true })
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Failed to delete task');
    return error('Internal server error', 500)
  }
}
