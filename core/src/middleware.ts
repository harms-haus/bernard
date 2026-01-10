import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'

export const runtime = 'nodejs';

const PUBLIC_PATHS = [
  '/health',
  '/api/health',
  '/api/auth',
  '/api/proxy-stream',
  '/auth',
  '/bernard',
  '/bernard/',
  '/bernard/login',
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
  const host = request.headers.get('host')

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Check authentication
  const authHeader = request.headers.get('authorization')
  const user = await getCurrentUser(authHeader)

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Add user context to headers for downstream use
  const response = NextResponse.next()
  response.headers.set('x-user-id', user.user.id)
  response.headers.set('x-user-role', user.user.isAdmin ? 'admin' : 'user')
  
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
