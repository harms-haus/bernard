import { z } from 'zod'

export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const serviceCommandSchema = z.object({
  command: z.enum(['start', 'stop', 'restart']),
})

export const serviceIdSchema = z.object({
  service: z.string().min(1, { message: 'Service ID is required' }),
})

export const taskActionSchema = z.object({
  taskId: z.string().uuid({ message: 'Valid task ID is required' }),
  action: z.enum(['cancel']),
})

export function validateSchema<T>(
  schema: z.ZodSchema<T>, 
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error.issues.map(i => i.message).join(', ') }
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: string; status: number }> {
  try {
    const body = await request.json()
    const result = schema.safeParse(body)
    if (result.success) {
      return { success: true, data: result.data }
    }
    return { 
      success: false, 
      error: result.error.issues.map(i => i.message).join(', '), 
      status: 400 
    }
  } catch {
    return { success: false, error: 'Invalid JSON', status: 400 }
  }
}
