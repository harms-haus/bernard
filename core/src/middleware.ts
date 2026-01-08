import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/auth/adminAuth'

const PUBLIC_PATHS = [
  '/health',
  '/api/health',
  '/api/auth/login',
  '/api/auth/callback',
  '/api/auth/me',
  '/bernard/',
  '/bernard/api/',
  '/bernard/api/auth/',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(path => 
    pathname === path || pathname.startsWith(path + '/')
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const authHeader = request.headers.get('authorization')
  const adminUser = getAdminUser(process.env.ADMIN_API_KEY, authHeader)

  if (adminUser) {
    const response = NextResponse.next()
    response.headers.set('x-user-id', adminUser.user.id)
    response.headers.set('x-user-role', 'admin')
    return response
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('redirect', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
