import { NextRequest, NextResponse } from 'next/server'
import { error, ok } from '../../../../lib/api/response'
import { getSessionFromHeader } from '../../../../lib/auth/session'

export interface MeUser {
  id: string
  displayName: string
  isAdmin: boolean
  status: 'active' | 'disabled' | 'deleted'
  createdAt: string
  updatedAt: string
  avatarUrl?: string
  email?: string
}

export interface MeResponse {
  user: MeUser
  sessionId: string
}

async function handleMe(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const session = await getSessionFromHeader(authHeader)

  if (!session) {
    return error('Not authenticated', 401)
  }

  return ok<MeResponse>({
    user: {
      id: session.user.id,
      displayName: session.user.displayName,
      isAdmin: session.user.isAdmin,
      status: session.user.status,
      createdAt: session.user.createdAt,
      updatedAt: session.user.updatedAt,
      avatarUrl: session.user.avatarUrl,
      email: session.user.email,
    },
    sessionId: session.sessionId,
  })
}

export async function GET(request: NextRequest) {
  return handleMe(request)
}
