import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, type AuthenticatedSession } from './session'

export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

export async function requireAdmin(req: NextRequest): Promise<AuthenticatedSession | NextResponse> {
  try {
    const authHeader = bearerToken(req)
    const user = await getCurrentUser(authHeader)

    if (!user) {
      throw new Error('Authentication required')
    }

    if (!user.user.isAdmin) {
      throw new Error('Admin access required')
    }

    return user
  } catch (error) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
}

export async function requireAuth(req: NextRequest): Promise<AuthenticatedSession | NextResponse> {
  try {
    const authHeader = bearerToken(req)
    const user = await getCurrentUser(authHeader)

    if (!user) {
      throw new Error('Authentication required')
    }

    return user
  } catch (error) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
}
