/**
 * CORS middleware for OpenAI-compatible API endpoints
 * Provides consistent CORS handling across all OpenAI endpoints
 */

export type CorsHeaders = {
  'Access-Control-Allow-Origin'?: string;
  'Access-Control-Allow-Methods'?: string;
  'Access-Control-Allow-Headers'?: string;
  'Access-Control-Allow-Credentials'?: string;
};

export function getCorsHeaders(origin: string | null): CorsHeaders {
  // Allow specific origins or all origins for development
  const allowedOrigins = process.env['ALLOWED_ORIGINS']?.split(',').map(s => s.trim()) || [];
  
  if (allowedOrigins.length > 0) {
    // If specific origins are configured, check if the request origin is allowed
    if (origin && allowedOrigins.includes(origin)) {
      return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true'
      };
    }
    // If no specific origin match, return empty headers (will be blocked by browser)
    return {};
  }
  
  // Default: allow all origins (development mode)
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

export function withCors(handler: (request?: Request) => Response | Promise<Response>) {
  return async (request?: Request) => {
    // Handle direct calls (tests) where request might be undefined
    const origin = request?.headers.get('origin') || request?.headers.get('Origin') || null;
    const corsHeaders = getCorsHeaders(origin);
    
    const response = await handler(request);
    
    // Create a new Response with CORS headers instead of mutating the original
    // This avoids issues with immutable Response objects
    const corsResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers)
    });
    
    // Apply CORS headers to the new response
    for (const [key, value] of Object.entries(corsHeaders)) {
      if (value) {
        corsResponse.headers.set(key, value);
      }
    }
    
    return corsResponse;
  };
}

export function handleOptions(request?: Request) {
  const origin = request?.headers.get('origin') || request?.headers.get('Origin') || null;
  const corsHeaders = getCorsHeaders(origin);
  
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}