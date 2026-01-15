import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '../auth/helpers'
import { getTaskKeeper } from './factory'
import { error, ok, badRequest } from './response'

interface TaskActionBody {
  action?: unknown
  taskId?: unknown
}

export async function handleGetTasks(request: NextRequest): Promise<NextResponse> {
  try {
    const authUser = await requireAuth(request)
    if (authUser instanceof NextResponse) return authUser

    const userId = authUser.user.id
    const searchParams = request.nextUrl.searchParams
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const keeper = getTaskKeeper()
    const result = await keeper.listTasks({ userId, includeArchived, limit, offset })

    const responseData = {
      items: result.tasks,
      total: result.total,
      limit,
      offset,
    }
    return NextResponse.json({ success: true, data: responseData })
  } catch (err) {
    console.error('Failed to list tasks:', err)
    return error('Internal server error', 500)
  }
}

export async function handlePostTaskAction(
  request: NextRequest,
  body: TaskActionBody
): Promise<NextResponse> {
  try {
    const authUser = await requireAuth(request)
    if (authUser instanceof NextResponse) return authUser

    const userId = authUser.user.id
    const { action, taskId } = body

    if (!taskId || !action) {
      return badRequest('taskId and action are required')
    }

    const keeper = getTaskKeeper()

    if (action !== 'cancel') {
      return badRequest('Invalid action')
    }

    const task = await keeper.getTask(taskId as string)
    if (!task) {
      return error('Task not found', 404)
    }
    if (task.userId !== userId) {
      return error('Forbidden', 403)
    }
    const success = await keeper.cancelTask(taskId as string)
    if (!success) {
      return error('Cannot cancel task', 400)
    }

    return ok({ success: true })
  } catch (err) {
    console.error('Failed to perform task action:', err)
    return error('Internal server error', 500)
  }
}

export async function handleDeleteTask(
  request: NextRequest,
  searchParams: URLSearchParams
): Promise<NextResponse> {
  try {
    const authUser = await requireAuth(request)
    if (authUser instanceof NextResponse) return authUser

    const userId = authUser.user.id
    const taskId = searchParams.get('taskId')

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
    console.error('Failed to delete task:', err)
    return error('Internal server error', 500)
  }
}
