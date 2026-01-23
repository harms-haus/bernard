// Type definitions for Hono context variables
import type { Context } from 'hono'

// Extend Hono's Context type with our custom variables
declare module 'hono' {
  interface ContextVariableMap {
    sessionToken?: string
    session?: {
      user?: {
        id: string
        role: string
        email?: string
        name?: string
      }
    }
  }
}
