import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual('@/lib/auth/session') as object
  return {
    ...actual,
    getCurrentUser: vi.fn(),
    setSessionCookie: vi.fn(),
    clearSessionCookie: vi.fn(),
  }
})

vi.mock('@/lib/auth/oauth', async () => {
  const actual = await vi.importActual('@/lib/auth/oauth') as object
  return {
    ...actual,
    getOAuthConfig: vi.fn(),
    createOAuthState: vi.fn(),
    validateOAuthState: vi.fn(),
    exchangeCodeForToken: vi.fn(),
    fetchUserInfo: vi.fn(),
    createOAuthSession: vi.fn(),
  }
})

const { getCurrentUser: mockGetCurrentUser, setSessionCookie: mockSetSessionCookie, clearSessionCookie: mockClearSessionCookie }: any = await import('@/lib/auth/session')
const { getOAuthConfig: mockGetOAuthConfig, createOAuthState: mockCreateOAuthState }: any = await import('@/lib/auth/oauth')

describe('GET /api/auth/[...provider]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = (url: string) =>
    ({
      url,
      headers: new Headers(),
      signal: {
        addEventListener: vi.fn(),
      },
    }) as unknown as import('next/server').NextRequest

  const createMockParams = (provider: string[]) =>
    ({ params: Promise.resolve({ provider }) }) as { params: Promise<{ provider: string[] }> }

  it('should redirect to auth URL for github login', async () => {
    const request = createMockRequest('http://localhost/api/auth/github/login')
    const params = createMockParams(['github', 'login'])

    const response = await GET(request, params)

    expect(response.status).toBe(302)
    const location = response.headers.get('location')
    // Verify redirect to OAuth provider authorization URL
    expect(location).toBeDefined()
  })

  it('should redirect to auth URL for google login', async () => {
    const request = createMockRequest('http://localhost/api/auth/google/login')
    const params = createMockParams(['google', 'login'])

    const response = await GET(request, params)

    expect(response.status).toBe(302)
    const location = response.headers.get('location')
    expect(location).toContain('/bernard/api/auth/google/login')
  })

  it('should return 400 for invalid provider', async () => {
    const request = createMockRequest('http://localhost/api/auth/invalid/login')
    const params = createMockParams(['invalid', 'login'])

    const response = await GET(request, params)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid provider')
  })

  it('should redirect to /status when no error in callback', async () => {
    const request = createMockRequest('http://localhost/api/auth/github/callback')
    const params = createMockParams(['github', 'callback'])

    const response = await GET(request, params)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('/status')
  })

  it('should redirect to /login with error when error param present', async () => {
    const request = createMockRequest('http://localhost/api/auth/github/callback?error=access_denied')
    const params = createMockParams(['github', 'callback'])

    const response = await GET(request, params)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('/login')
    expect(response.headers.get('location')).toContain('error=access_denied')
  })

  it('should return 404 for unknown action', async () => {
    const request = createMockRequest('http://localhost/api/auth/github/unknown')
    const params = createMockParams(['github', 'unknown'])

    const response = await GET(request, params)

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Not found')
  })
})

describe('POST /api/auth/[...provider]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = (url: string) =>
    ({
      url,
      headers: new Headers(),
    }) as unknown as import('next/server').NextRequest

  const createMockParams = (provider: string[]) =>
    ({ params: Promise.resolve({ provider }) }) as { params: Promise<{ provider: string[] }> }

  it('should clear session cookie and return success for logout', async () => {
    const request = createMockRequest('http://localhost/api/auth/github/logout')
    const params = createMockParams(['github', 'logout'])

    const response = await POST(request, params)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
    const sessionCookie = response.cookies.get('bernard_session')
    expect(sessionCookie).toBeDefined()
    // Verify cookie is being cleared (empty value or past expiry)
    expect(sessionCookie?.value).toBe('')
  })

  it('should clear session cookie for google provider logout', async () => {
    const request = createMockRequest('http://localhost/api/auth/google/logout')
    const params = createMockParams(['google', 'logout'])

    const response = await POST(request, params)

    expect(response.status).toBe(200)
    expect(response.cookies.get('bernard_session')).toBeDefined()
  })
  it('should return 404 for unknown action', async () => {
    const request = createMockRequest('http://localhost/api/auth/github/unknown')
    const params = createMockParams(['github', 'unknown'])

    const response = await POST(request, params)

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Not found')
  })
})
