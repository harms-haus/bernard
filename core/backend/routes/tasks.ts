import { Hono } from 'hono'
import { handleGetTasks, handlePostTaskAction, handleDeleteTask } from '../../src/lib/api/tasks'
import { requireAuth } from '../utils/auth'
import { badRequest, error, ok } from '../../src/lib/api/response'
import { getTaskKeeper } from '../../src/lib/api/factory'
import { logger } from '../../src/lib/logging/logger'

const tasksRoutes = new Hono()

// GET /api/tasks - List tasks
tasksRoutes.get('/', async (c) => {
  // handleGetTasks expects NextRequest, but we can adapt
  const response = await handleGetTasks(c.req.raw as any)
  return c.body(await response.text(), response.status, Object.fromEntries(response.headers.entries()))
})

// POST /api/tasks - Create or update task
tasksRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const response = await handlePostTaskAction(c.req.raw as any, body)
  return c.body(await response.text(), response.status, Object.fromEntries(response.headers.entries()))
})

// DELETE /api/tasks - Delete task
tasksRoutes.delete('/', async (c) => {
  try {
    const authUser = await requireAuth(c)
    if (!authUser) return c.json({ error: 'Session required' }, 403)

    const userId = authUser.user.id
    const taskId = c.req.query('taskId')

    if (!taskId) {
      return c.json(badRequest('taskId is required').data, badRequest('taskId is required').status)
    }

    const keeper = getTaskKeeper()
    const task = await keeper.getTask(taskId)

    if (!task) {
      return c.json(error('Task not found', 404).data, 404)
    }
    if (task.userId !== userId) {
      return c.json(error('Forbidden', 403).data, 403)
    }

    const success = await keeper.deleteTask(taskId)
    if (!success) {
      return c.json(error('Cannot delete task', 400).data, 400)
    }

    return c.json(ok({ success: true }).data, ok({ success: true }).status)
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Failed to delete task')
    return c.json(error('Internal server error', 500).data, 500)
  }
})

// GET /api/tasks/:id - Get task details
tasksRoutes.get('/:id', async (c) => {
  const { id } = c.req.param()
  // Adapt handleGetTasks to work with Hono
  const url = new URL(c.req.url)
  url.searchParams.set('taskId', id)
  const adaptedRequest = new Request(url.toString(), {
    method: 'GET',
    headers: Object.fromEntries(c.req.raw.headers.entries()),
  })
  const response = await handleGetTasks(adaptedRequest as any)
  return c.body(await response.text(), response.status, Object.fromEntries(response.headers.entries()))
})

// DELETE /api/tasks/:id - Delete task by ID
tasksRoutes.delete('/:id', async (c) => {
  const { id } = c.req.param()
  try {
    const authUser = await requireAuth(c)
    if (!authUser) return c.json({ error: 'Session required' }, 403)

    const userId = authUser.user.id

    const keeper = getTaskKeeper()
    const task = await keeper.getTask(id)

    if (!task) {
      return c.json(error('Task not found', 404).data, 404)
    }
    if (task.userId !== userId) {
      return c.json(error('Forbidden', 403).data, 403)
    }

    const success = await keeper.deleteTask(id)
    if (!success) {
      return c.json(error('Cannot delete task', 400).data, 400)
    }

    return c.json(ok({ success: true }).data, ok({ success: true }).status)
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Failed to delete task')
    return c.json(error('Internal server error', 500).data, 500)
  }
})

export default tasksRoutes
