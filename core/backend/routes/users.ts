import { Hono } from 'hono'
import { requireAdmin } from '../utils/auth'
import { logger } from '../../src/lib/logging/logger'
import { getRedis } from '../../src/lib/infra/redis'
import type { UserRecord, UserRole } from '../../src/lib/auth/types'

type UserStatus = 'active' | 'disabled' | 'deleted'

const VALID_USER_ROLES: readonly UserRole[] = ['guest', 'user', 'admin']
function isValidUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (VALID_USER_ROLES as readonly string[]).includes(role)
}

function betterAuthUserKey(id: string) {
  return `ba:m:user:${id}`
}

function betterAuthUserIdsKey() {
  return `ba:s:user:ids`
}

async function getBetterAuthUsers(): Promise<UserRecord[]> {
  const redis = getRedis()
  const userIds = await redis.smembers(betterAuthUserIdsKey())

  const users = await Promise.all(
    userIds.map(async (id) => {
      const data = await redis.hgetall(betterAuthUserKey(id))
      if (!data || Object.keys(data).length === 0) return null

      // Transform BetterAuth user to UserRecord format
      const user: UserRecord = {
        id: data.id || id,
        displayName: data.name || data.email || id,
        role: (data.role as UserRole) || 'user',
        status: data.emailVerified ? 'active' : 'disabled',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
        email: data.email,
        avatarUrl: data.image,
      }

      return user
    })
  )

  return users.filter((u): u is UserRecord => u !== null)
}

async function getBetterAuthUser(id: string): Promise<UserRecord | null> {
  const redis = getRedis()
  const data = await redis.hgetall(betterAuthUserKey(id))
  if (!data || Object.keys(data).length === 0) return null

  const user: UserRecord = {
    id: data.id || id,
    displayName: data.name || data.email || id,
    role: isValidUserRole(data.role) ? data.role : 'user',
    status: data.emailVerified ? 'active' : 'disabled',
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
    email: data.email,
    avatarUrl: data.image,
  }

  return user
}

const usersRoutes = new Hono()

// GET /api/users - List users (admin only)
usersRoutes.get('/', async (c) => {
  try {
    const session = await requireAdmin(c)
    if (!session) {
      return c.json({ error: 'Admin access required' }, 403)
    }

    const users = await getBetterAuthUsers()

    logger.info({ action: 'users.read', adminId: session.user.id, count: users.length })
    return c.json({ users })
  } catch (error) {
    logger.error({ error }, 'Failed to list users')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /api/users - Create user (admin only)
usersRoutes.post('/', async (c) => {
  try {
    const session = await requireAdmin(c)
    if (!session) {
      return c.json({ error: 'Admin access required' }, 403)
    }

    const body = await c.req.json() as { id: string; displayName: string; role: unknown }
    const { id, displayName, role } = body

    if (!id || !displayName) {
      return c.json({ error: 'id and displayName are required' }, 400)
    }
    if (!isValidUserRole(role)) {
      return c.json({ error: `Invalid role: ${role}. Must be one of: guest, user, admin` }, 400)
    }

    const redis = getRedis()
    const key = betterAuthUserKey(id)
    const existing = await redis.hgetall(key)
    if (existing && existing['id']) {
      return c.json({ error: 'User already exists' }, 400)
    }

    const now = new Date().toISOString()
    await redis.hset(key, {
      id,
      name: displayName,
      email: id,
      role: role,
      emailVerified: '',
      createdAt: now,
      updatedAt: now,
      image: '',
    })
    await redis.sadd(betterAuthUserIdsKey(), id)

    const user: UserRecord = {
      id,
      displayName,
      role,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      email: id,
    }

    logger.info({ action: 'users.create', adminId: session.user.id, userId: user.id })
    return c.json({ user }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user'
    logger.error({ error }, 'Failed to create user')
    return c.json({ error: message }, 400)
  }
})

// GET /api/users/:id - Get user (admin only)
usersRoutes.get('/:id', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const { id } = c.req.param()
    const user = await getBetterAuthUser(id)

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    logger.info({ action: 'users.read_one', adminId: admin.user.id, userId: id })
    return c.json({ user })
  } catch (error) {
    logger.error({ error }, 'Failed to get user')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// PATCH /api/users/:id - Update user (admin only)
usersRoutes.patch('/:id', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const { id } = c.req.param()
    const body = await c.req.json() as { displayName?: string; role?: UserRole; status?: UserStatus }
    const { displayName, role, status } = body

    if (displayName !== undefined && typeof displayName !== 'string') {
      return c.json({ error: 'displayName must be a string' }, 400)
    }

    if (role !== undefined && !isValidUserRole(role)) {
      return c.json({ error: `Invalid role: ${role}. Must be one of: guest, user, admin` }, 400)
    }
    if (status !== undefined && !['active', 'disabled', 'deleted'].includes(status)) {
      return c.json({ error: `Invalid status: ${status}. Must be one of: active, disabled, deleted` }, 400)
    }

    if (!displayName && role === undefined && !status) {
      return c.json({ error: 'At least one field is required' }, 400)
    }

    const redis = getRedis()
    const key = betterAuthUserKey(id)
    const existing = await redis.hgetall(key)
    if (!existing || !existing['id']) {
      return c.json({ error: 'User not found' }, 404)
    }

    const updates: Record<string, string> = { updatedAt: new Date().toISOString() }
    if (displayName) updates['name'] = displayName
    if (role !== undefined) updates['role'] = role
    if (status) {
      // For status, we update emailVerified field
      updates['emailVerified'] = status === 'active' ? 'true' : ''
    }

    await redis.hset(key, updates)

    const updated = await getBetterAuthUser(id)
    if (!updated) {
      return c.json({ error: 'User not found' }, 404)
    }

    logger.info({ action: 'users.update', adminId: admin.user.id, userId: id, updates })
    return c.json({ user: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update user'
    logger.error({ error }, 'Failed to update user')
    return c.json({ error: message }, 400)
  }
})

// DELETE /api/users/:id - Delete user (admin only)
usersRoutes.delete('/:id', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const { id } = c.req.param()
    const redis = getRedis()
    const key = betterAuthUserKey(id)
    const existing = await redis.hgetall(key)

    if (!existing || !existing['id']) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Actually delete the user from Redis
    await redis.del(key)

    logger.info({ action: 'users.delete', adminId: admin.user.id, userId: id })
    return c.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to delete user')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// POST /api/users/:id/reset - Reset user (admin only)
usersRoutes.post('/:id/reset', async (c) => {
  try {
    const admin = await requireAdmin(c)
    if (!admin) return c.json({ error: 'Admin access required' }, 403)

    const { id } = c.req.param()
    const redis = getRedis()
    const key = betterAuthUserKey(id)
    const existing = await redis.hgetall(key)

    if (!existing || !existing['id']) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Reset password by clearing password hash (user will need to set new password)
    await redis.hdel(key, 'password')

    logger.info({ action: 'users.reset', adminId: admin.user.id, userId: id })
    return c.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to reset user')
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default usersRoutes
