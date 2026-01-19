import { NextRequest, NextResponse } from 'next/server'

const LANGGRAPH_API_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024'

export function getLangGraphUrl(path: string): string {
  return `${LANGGRAPH_API_URL}${path}`
}

export interface LangGraphProxyOptions {
  streaming?: boolean
  timeout?: number
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  userId?: string
}

export async function proxyToLangGraph(
  request: NextRequest,
  path: string,
  options: LangGraphProxyOptions = {}
): Promise<NextResponse> {
  const { streaming = false, timeout = 120000, method, userId } = options
  const targetUrl = getLangGraphUrl(path)
  const httpMethod = method || request.method
  const isBodyAllowed = httpMethod !== 'GET' && httpMethod !== 'HEAD'

  try {
    // Only read body for methods that allow it
    let body: ArrayBuffer | Uint8Array | undefined = isBodyAllowed ? await request.arrayBuffer() : undefined

    // Create mutable headers from original request
    const proxyHeaders = new Headers(request.headers)

    // Inject user_id into thread creation/update requests (stored in metadata)
    if ((path === '/threads' || path.startsWith('/threads?') || path.match(/^\/\/threads\/[a-zA-Z0-9-]+$/)) && (httpMethod === 'POST' || httpMethod === 'PATCH')) {
      try {
        const bodyText = body ? new TextDecoder().decode(body) : ''

        if (bodyText) {
          // Parse existing body and add user_id to metadata
          const jsonBody = JSON.parse(bodyText)
          // Preserve existing metadata, merge user_id (if available), and ensure name is in metadata for updates
          const newMetadata = {
            ...(jsonBody.metadata || {}),
            ...(userId ? { user_id: userId } : {}),
            ...(httpMethod === 'PATCH' && jsonBody.name ? { name: jsonBody.name } : {})
          }
          jsonBody.metadata = newMetadata
          body = new TextEncoder().encode(JSON.stringify(jsonBody))
        } else if (userId) {
          // Empty body - create new with user_id in metadata
          body = new TextEncoder().encode(JSON.stringify({ metadata: { user_id: userId } }))
        }

        // Update content-length header to match new body size
        proxyHeaders.set('content-length', String(body?.byteLength || 0))
      } catch (err) {
        // Body is not JSON, pass through as-is
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const proxyReq = new Request(targetUrl, {
        method: httpMethod,
        headers: proxyHeaders,
        body,
        duplex: 'half',
        signal: controller.signal,
      } as RequestInit)

      const response = await fetch(proxyReq)
      clearTimeout(timeoutId)

      // Handle streaming responses
      if (streaming && response.body) {
        const headers = new Headers()
        headers.set('Transfer-Encoding', 'chunked')
        headers.set('Cache-Control', 'no-cache')
        headers.set('X-Accel-Buffering', 'no')
        headers.set('Access-Control-Allow-Origin', '*')
        headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key')

        // Copy relevant headers from upstream response
        for (const [key, value] of response.headers.entries()) {
          if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
            headers.set(key, value)
          }
        }

        return new NextResponse(response.body, {
          status: response.status,
          headers,
        })
      }

      // Handle JSON responses
      const contentType = response.headers.get('content-type') || ''
      let responseData: unknown

      if (contentType.includes('application/json')) {
        try {
          responseData = await response.json()
        } catch {
          // JSON parse failed - read as text instead
          responseData = await response.text()
        }
      } else {
        responseData = await response.text()
      }

      if (typeof responseData === 'string') {
        return new NextResponse(responseData, { status: response.status })
      }
      return NextResponse.json(responseData, { status: response.status })
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.error(`LangGraph proxy error for ${path}:`, error)
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout', message: `LangGraph request timed out after ${timeout}ms` },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { error: 'Upstream Error', message: (error as Error).message },
      { status: 502 }
    )
  }
}

export function passthroughAuth(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  const authHeader = headers.get('authorization')
  const cookie = headers.get('cookie')
  const apiKey = headers.get('x-api-key')

  if (authHeader) result['authorization'] = authHeader
  if (cookie) result['cookie'] = cookie
  if (apiKey) result['x-api-key'] = apiKey

  return result
}
