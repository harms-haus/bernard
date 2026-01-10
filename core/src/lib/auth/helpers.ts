import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin as requireAdminAuth, requireAuth as requireAuthFn, type AuthenticatedSession } from './session'

export function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

export async function requireAdmin(req: NextRequest): Promise<AuthenticatedSession | NextResponse> {
  try {
    const user = await requireAdminAuth()
    return user
  } catch (error) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
}

export async function requireAuth(req: NextRequest): Promise<AuthenticatedSession | NextResponse> {
  try {
    const token = bearerToken(req)
    const user = await requireAuthFn()
    return user
  } catch (error) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
}
