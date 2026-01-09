import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const authHeader = request.headers.get('authorization')
  
  const user = await getCurrentUser(authHeader)
  
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      id: user.user.id,
      displayName: user.user.displayName,
      isAdmin: user.user.isAdmin,
      status: user.user.status,
      email: user.user.email,
      avatarUrl: user.user.avatarUrl,
    },
    sessionId: user.sessionId,
  })
}
