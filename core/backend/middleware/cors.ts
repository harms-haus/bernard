import { cors } from 'hono/cors'

// CORS configuration with allowlist
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3456').split(',').map(s => s.trim())

export const corsConfig = cors({
  origin: (origin: string) => {
    if (!origin) return allowedOrigins[0] || 'http://localhost:3456'
    return allowedOrigins.includes(origin) ? origin : null
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  exposeHeaders: ['Cache-Control', 'Pragma', 'Expires'],
})

export const noCacheHeaders = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}
