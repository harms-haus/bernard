import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

export async function errorHandler(err: Error, c: Context) {
  console.error('Error:', err)

  if (err instanceof HTTPException) {
    return err.getResponse()
  }

  // Handle unknown errors
  return c.json(
    {
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    },
    500
  )
}
