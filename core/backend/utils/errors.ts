/**
 * OpenAI-Compatible Error Helper Functions
 *
 * These functions create error responses that match the OpenAI API specification.
 *
 * OpenAI Error Format:
 * {
 *   "error": {
 *     "message": "Error description",
 *     "type": "error_type",
 *     "param": "parameter_name",  // optional
 *     "code": "error_code"  // optional
 *   }
 * }
 */

/**
 * OpenAI error types from the API specification
 */
export const ERROR_CODES = {
  INVALID_REQUEST: 'invalid_request_error',
  INVALID_API_KEY: 'invalid_api_key',
  INSUFFICIENT_QUOTA: 'insufficient_quota',
  INTERNAL_ERROR: 'internal_error',
  RATE_LIMIT: 'rate_limit_error',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export function createOpenAIError(
  message: string,
  type: ErrorCode,
  param?: string,
  code?: string,
  details?: Record<string, unknown>
): { error: { message: string; type: ErrorCode; param?: string; code?: string; details?: Record<string, unknown> } } {
  return {
    error: {
      message,
      type,
      ...(param && { param }),
      ...(code && { code }),
      ...(details && { details }),
    },
  }
}

export function createInvalidRequestError(
  message: string,
  param?: string,
  details?: Record<string, unknown>
): ReturnType<typeof createOpenAIError> {
  return createOpenAIError(message, ERROR_CODES.INVALID_REQUEST, param, undefined, details)
}

export function createInternalError(
  message: string = 'Internal server error'
): ReturnType<typeof createOpenAIError> {
  return createOpenAIError(message, ERROR_CODES.INTERNAL_ERROR)
}
