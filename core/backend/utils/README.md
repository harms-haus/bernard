# Backend Utils

Utility functions for the Hono backend server.

## Structure

- `proxy.ts` - Service proxy utilities (to be implemented in Phase 2)

## Phase 2 Implementation

The `proxy.ts` utility will provide:
- `proxyRequest()` - Generic proxy function with SSE support
- `proxyToLangGraph()` - LangGraph-specific proxy helper
- Header forwarding and filtering
- Request timeout handling
- Streaming response support
