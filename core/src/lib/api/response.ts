/**
 * Standardized API response helpers for Hono routes
 * 
 * These functions return objects with `data` and `status` properties
 * that can be used with Hono's `c.json()` method.
 */

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

interface ResponseHelper<T> {
  data: T
  status: number
}

/**
 * Create a successful JSON response
 */
export function ok<T>(data: T, status = 200): ResponseHelper<{ success: true; data: T }> {
  return { data: { success: true, data }, status }
}

/**
 * Create an error JSON response
 */
export function error(message: string, status = 400): ResponseHelper<{ success: false; error: string }> {
  return { data: { success: false, error: message }, status }
}

/**
 * Create a created (201) response
 */
export function created<T>(data: T): ResponseHelper<{ success: true; data: T }> {
  return { data: { success: true, data }, status: 201 }
}

/**
 * Create a not found (404) response
 */
export function notFound(message = 'Not found'): ResponseHelper<{ success: false; error: string }> {
  return { data: { success: false, error: message }, status: 404 }
}

/**
 * Create an unauthorized (401) response
 */
export function unauthorized(message = 'Unauthorized'): ResponseHelper<{ success: false; error: string }> {
  return { data: { success: false, error: message }, status: 401 }
}

/**
 * Create a forbidden (403) response
 */
export function forbidden(message = 'Forbidden'): ResponseHelper<{ success: false; error: string }> {
  return { data: { success: false, error: message }, status: 403 }
}

/**
 * Create a bad request (400) response with optional details
 */
export function badRequest(message: string, details?: Record<string, unknown>): ResponseHelper<{ success: false; error: string; details?: Record<string, unknown> }> {
  const body: { success: false; error: string; details?: Record<string, unknown> } = { success: false, error: message }
  if (details) {
    body.details = details
  }
  return { data: body, status: 400 }
}

/**
 * Create a server error (500) response
 */
export function serverError(message = 'Internal server error'): ResponseHelper<{ success: false; error: string }> {
  return { data: { success: false, error: message }, status: 500 }
}

/**
 * Create a no content (204) response
 */
export function noContent(): ResponseHelper<null> {
  return { data: null, status: 204 }
}

/**
 * Create a JSON response with custom structure
 */
export function json<T>(data: T, status = 200): ResponseHelper<T> {
  return { data, status }
}
