/**
 * Enhanced CORS utilities for Bernard API endpoints
 * Provides consistent CORS handling with better error handling and debugging
 */

import type { CorsHeaders } from "./cors";
import { getCorsHeaders } from "./cors";
import { logger } from "@/lib/logging";

/**
 * Get CORS headers with enhanced origin matching and debugging
 */
export function getCorsHeadersForRequest(request: Request | null | undefined): CorsHeaders {
  if (!request) {
    // Handle direct calls (tests) where request might be undefined
    return getCorsHeaders(null);
  }

  // Try multiple case variations of the Origin header
  const origin = request.headers.get('origin') ||
                 request.headers.get('Origin') ||
                 request.headers.get('ORIGIN') ||
                 null;

  return getCorsHeaders(origin);
}

/**
 * Create a CORS-enabled response with proper headers
 */
export function createCorsResponse(
  body: BodyInit | null,
  init: ResponseInit = {},
  request?: Request | null
): Response {
  const corsHeaders = getCorsHeadersForRequest(request);
  
  const response = new Response(body, {
    ...init,
    headers: {
      ...init.headers,
      ...corsHeaders
    }
  });
  
  return response;
}

/**
 * Handle CORS preflight requests with proper headers
 */
export function handleCorsPreflight(request?: Request): Response {
  const corsHeaders = getCorsHeadersForRequest(request);
  
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Access-Control-Max-Age': '86400' // Cache preflight for 24 hours
    }
  });
}

/**
 * Debug function to log CORS decisions
 */
export function debugCorsHeaders(request: Request | null): void {
  if (!request) return;
  
  const origin = request.headers.get('origin') || 
                 request.headers.get('Origin') || 
                 request.headers.get('ORIGIN') || 
                 null;
  
  const allowedOrigins = process.env['ALLOWED_ORIGINS']?.split(',').map(s => s.trim()) || [];
  
  logger.debug({
    event: "cors.debug",
    origin,
    allowedOrigins,
    headers: getCorsHeaders(origin)
  }, '[CORS DEBUG]');
}
