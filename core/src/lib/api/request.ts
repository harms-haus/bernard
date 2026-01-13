/**
 * Request parsing utilities for testable routes
 */

import { NextRequest } from 'next/server'

export interface ParsedQueryParams {
  [key: string]: string | string[] | undefined
}

/**
 * Parse all query parameters from a request
 */
export function parseQueryParams(request: NextRequest): ParsedQueryParams {
  const params: ParsedQueryParams = {}
  const searchParams = request.nextUrl.searchParams
  
  for (const [key, value] of searchParams.entries()) {
    if (params[key] !== undefined) {
      // Convert to array if multiple values
      const existing = params[key]
      params[key] = Array.isArray(existing) 
        ? [...existing, value]
        : [existing, value]
    } else {
      params[key] = value
    }
  }
  
  return params
}

/**
 * Get a required query parameter
 */
export function getRequiredParam(params: ParsedQueryParams, key: string): string | null {
  const value = params[key]
  if (!value) return null
  return Array.isArray(value) ? value[0] : value
}

/**
 * Get an integer query parameter with default
 */
export function getIntParam(
  params: ParsedQueryParams, 
  key: string, 
  defaultValue: number
): number {
  const value = getRequiredParam(params, key)
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Get a boolean query parameter with default
 */
export function getBoolParam(
  params: ParsedQueryParams, 
  key: string, 
  defaultValue: boolean
): boolean {
  const value = getRequiredParam(params, key)
  if (!value) return defaultValue
  return value === 'true' || value === '1'
}

/**
 * Parse pagination from query params
 */
export function parsePagination(params: ParsedQueryParams) {
  return {
    limit: getIntParam(params, 'limit', 50),
    offset: getIntParam(params, 'offset', 0),
  }
}

/**
 * Check if a required parameter is missing
 */
export function requireParams(params: ParsedQueryParams, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = getRequiredParam(params, key)
    if (!value) {
      return key
    }
  }
  return null
}
