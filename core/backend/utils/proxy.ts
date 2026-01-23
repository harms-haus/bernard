import type { Context } from 'hono'

const LANGGRAPH_API_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024'

// RFC-2616 hop-by-hop headers that must not be forwarded
const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]

export interface ProxyOptions {
  streaming?: boolean
  timeout?: number
  body?: unknown
}

export interface LangGraphProxyOptions extends ProxyOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  userId?: string
  userRole?: string
}

export function getLangGraphUrl(path: string): string {
  return `${LANGGRAPH_API_URL}${path}`
}

/**
 * Generic proxy function with SSE support
 */
export async function proxyRequest(
  c: Context,
  targetUrl: string,
  options: ProxyOptions = {}
): Promise<Response> {
  const { streaming = false, timeout = 30000, body } = options
  const url = new URL(targetUrl)

  // Forward query params
  const queryParams = c.req.query()
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value)
    }
  })

  const headers = new Headers()
  // Forward relevant headers
  if (c.req.header('authorization')) {
    headers.set('authorization', c.req.header('authorization')!)
  }
  if (c.req.header('content-type')) {
    headers.set('content-type', c.req.header('content-type')!)
  }
  if (c.req.header('x-api-key')) {
    headers.set('x-api-key', c.req.header('x-api-key')!)
  }
  if (c.req.header('cookie')) {
    headers.set('cookie', c.req.header('cookie')!)
  }

  // Read request body safely
  let requestBody: BodyInit | undefined
  const contentType = c.req.header('content-type')
  if (body !== undefined) {
    requestBody = JSON.stringify(body)
    headers.set('content-type', 'application/json')
  } else if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const bodyText = await c.req.text().catch(() => '')
    if (bodyText) {
      requestBody = bodyText
      if (contentType) {
        headers.set('content-type', contentType)
      }
    }
  }

  // Add request timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url.toString(), {
      method: c.req.method,
      headers,
      body: requestBody,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // Handle SSE streaming responses
    if (streaming && response.body) {
      // SSE-specific headers
      const streamHeaders = new Headers()
      streamHeaders.set('Content-Type', 'text/event-stream')
      streamHeaders.set('Cache-Control', 'no-cache')
      streamHeaders.set('Connection', 'keep-alive')
      streamHeaders.set('X-Accel-Buffering', 'no')
      streamHeaders.set('Access-Control-Allow-Origin', '*')
      streamHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      streamHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key')

      // Copy relevant non-hop-by-hop headers
      response.headers.forEach((value, key) => {
        if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
          streamHeaders.set(key, value)
        }
      })

      // Stream response body using Hono's streaming
      return c.body(response.body, 200, { headers: Object.fromEntries(streamHeaders) })
    }

    // Copy allowed headers from response (excluding hop-by-hop headers)
    const responseHeaders = new Headers()
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) {
        responseHeaders.set(key, value)
      }
    })

    // Handle 204 No Content
    if (response.status === 204) {
      return new Response(null, {
        status: 204,
        headers: responseHeaders,
      })
    }

    // Forward response
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error) {
    clearTimeout(timeoutId)
    // Return controlled error response
    console.error('Proxy request failed:', error)
    if (error instanceof Error && error.name === 'AbortError') {
      return c.json(
        { error: 'Request timeout', message: `Proxy request timed out after ${timeout}ms` },
        504
      )
    }
    return c.json(
      { error: 'Proxy request failed', message: error instanceof Error ? error.message : String(error) },
      502
    )
  }
}

/**
 * LangGraph-specific proxy helper with userId/userRole injection
 */
export async function proxyToLangGraph(
  c: Context,
  path: string,
  options: LangGraphProxyOptions = {}
): Promise<Response> {
  const { streaming = false, timeout = 120000, method, userId, userRole } = options
  const targetUrl = getLangGraphUrl(path)
  const httpMethod = method || (c.req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')
  const isBodyAllowed = httpMethod !== 'GET' && httpMethod !== 'HEAD'

  try {
    // Only read body for methods that allow it
    let body: ArrayBuffer | Uint8Array | undefined
    if (isBodyAllowed) {
      const bodyText = await c.req.text().catch(() => '')
      body = bodyText ? new TextEncoder().encode(bodyText) : undefined
    }

    // Create mutable headers from original request
    const proxyHeaders = new Headers()
    c.req.raw.headers.forEach((value, key) => {
      proxyHeaders.set(key, value)
    })

    // Inject user_id into thread creation/update requests (stored in metadata)
    if ((path === '/threads' || path.startsWith('/threads?') || path.match(/^\/threads\/[a-zA-Z0-9-]+$/)) && (httpMethod === 'POST' || httpMethod === 'PATCH')) {
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

    // Inject userRole into run input for tool selection
    if (path.startsWith('/threads/') && path.includes('/runs') && (httpMethod === 'POST' || httpMethod === 'PUT')) {
      try {
        const bodyText = body ? new TextDecoder().decode(body) : ''

        if (bodyText) {
          const jsonBody = JSON.parse(bodyText)
          
          // Add userRole to input for runtime tool selection
          if (userRole) {
            jsonBody.input = {
              ...(jsonBody.input || {}),
              userRole,
            }
          }
          
          body = new TextEncoder().encode(JSON.stringify(jsonBody))
          proxyHeaders.set('content-length', String(body?.byteLength || 0))
        }
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

        return c.body(response.body, response.status, { headers: Object.fromEntries(headers) })
      }

      // Handle JSON responses
      const contentType = response.headers.get('content-type') || ''
      let responseData: unknown

      // Read body once as text, then attempt to parse as JSON
      const rawBody = await response.text()

      if (contentType.includes('application/json')) {
        try {
          responseData = JSON.parse(rawBody)
        } catch {
          // JSON parse failed - use raw text
          responseData = rawBody
        }
      } else {
        responseData = rawBody
      }

      if (typeof responseData === 'string') {
        // Handle 204 No Content - it can't have a body
        if (response.status === 204) {
          return new Response(null, { status: 204 })
        }
        return c.text(responseData, response.status)
      }
      return c.json(responseData, response.status)
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    console.error(`LangGraph proxy error for ${path}:`, error)
    if (error instanceof Error && error.name === 'AbortError') {
      return c.json(
        { error: 'Request timeout', message: `LangGraph request timed out after ${timeout}ms` },
        504
      )
    }
    return c.json(
      { error: 'Upstream Error', message: (error as Error).message },
      502
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
