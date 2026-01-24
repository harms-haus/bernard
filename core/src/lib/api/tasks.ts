import type { Context } from 'hono'
import { requireAuth } from '@/lib/auth/hono-helpers'
import { getTaskKeeper } from './factory'
import { error, ok, badRequest } from './response'

interface TaskActionBody {
  action?: unknown
  taskId?: unknown
}

export async function handleGetTasks(c: Context) {
  try {
    const authUser = await requireAuth(c)
    if (!authUser) return error('Admin access required', 403)

    const userId = authUser.user.id
    const includeArchived = c.req.query('includeArchived') === 'true'
    const limit = parseInt(c.req.query('limit') || '50', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)

    const keeper = getTaskKeeper()
    const result = await keeper.listTasks({ userId, includeArchived, limit, offset })

    const responseData = {
      items: result.tasks,
      total: result.total,
      limit,
      offset,
    }
    return ok(responseData)
  } catch (err) {
    console.error('Failed to list tasks:', err)
    return error('Internal server error', 500)
  }
}

export async function handleGetTaskById(c: Context, taskId: string) {
  try {
    const authUser = await requireAuth(c)
    if (!authUser) return error('Admin access required', 403)

    const userId = authUser.user.id
    const keeper = getTaskKeeper()
    const task = await keeper.getTask(taskId)

    if (!task) {
      return error('Task not found', 404)
    }
    if (task.userId !== userId) {
      return error('Forbidden', 403)
    }

    return ok(task)
  } catch (err) {
    console.error('Failed to get task:', err)
    return error('Internal server error', 500)
  }
}

export async function handlePostTaskAction(
  c: Context,
  body: TaskActionBody
) {
  try {
    const authUser = await requireAuth(c)
    if (!authUser) return error('Admin access required', 403)

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
  c: Context
) {
  try {
    const authUser = await requireAuth(c)
    if (!authUser) return error('Admin access required', 403)

    const userId = authUser.user.id
    const taskId = c.req.query('taskId')

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
