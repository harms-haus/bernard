import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth/adminAuth'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  switch (action) {
    case 'me': {
      const authHeader = request.headers.get('authorization')
      const adminUser = getAdminUser(process.env.ADMIN_API_KEY, authHeader)
      
      if (!adminUser) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      }

      return NextResponse.json({
        user: {
          id: adminUser.user.id,
          displayName: adminUser.user.displayName,
          isAdmin: adminUser.user.isAdmin,
          status: adminUser.user.status,
        },
      })
    }

    case 'admin': {
      const authHeader = request.headers.get('authorization')
      const adminUser = getAdminUser(process.env.ADMIN_API_KEY, authHeader)
      
      if (!adminUser || !adminUser.user.isAdmin) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }

      return NextResponse.json({
        user: {
          id: adminUser.user.id,
          displayName: adminUser.user.displayName,
          isAdmin: adminUser.user.isAdmin,
          status: adminUser.user.status,
        },
      })
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'logout') {
    const response = NextResponse.json({ success: true })
    response.cookies.set('session', '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
    return response
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
