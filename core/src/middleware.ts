import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser, initializeSession, createSessionDependencies } from '@/lib/auth/session'
import { initializeSettingsManager } from '@/lib/config/appSettings'
import { getRedis } from '@/lib/infra/redis'
import { buildStores } from '@/lib/auth/authCore'

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

// Track whether dependencies have been initialized for this process
let dependenciesInitialized = false

async function ensureDependenciesInitialized(): Promise<void> {
  if (dependenciesInitialized) return

  try {
    await initializeSettingsManager()
    const redis = getRedis()
    const stores = buildStores(redis)

    initializeSession(
      createSessionDependencies(
        stores,
        {
          get(name: string): { value: string } | undefined { return undefined },
          set(_name: string, _value: string, _options?: unknown): void {},
          delete(_name: string): void {},
        },
        604800,
        process.env.NODE_ENV === 'production'
      )
    )

    dependenciesInitialized = true
  } catch (err) {
    console.error('Failed to initialize session dependencies in middleware:', err)
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host')

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Initialize session dependencies if not already done
  await ensureDependenciesInitialized()

  // Check authentication
  const authHeader = request.headers.get('authorization')
  const user = await getCurrentUser(authHeader)

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Redirect to consolidated auth login page
    const loginUrl = new URL('/auth/login', request.url)
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
