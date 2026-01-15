import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3456),
  HOST: z.string().default("0.0.0.0"),
  REDIS_URL: z.string().url().or(z.string()).default("redis://localhost:6379"),
  ADMIN_API_KEY: z.string().min(32).optional(),
  SESSION_TTL_SECONDS: z.coerce.number().default(604800),
  TZ: z.string().default("America/Chicago"),
  BERNARD_API_URL: z.string().url().default("http://localhost:8800"),
  VLLM_URL: z.string().url().default("http://localhost:8860"),
  WHISPER_URL: z.string().url().default("http://localhost:8870"),
  KOKORO_URL: z.string().url().default("http://localhost:8880"),
  BERNARD_UI_URL: z.string().url().default("http://localhost:8810"),
  // BetterAuth configuration
  BETTER_AUTH_SECRET: z.string().min(32).or(z.literal("")).optional(),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3456"),
  BETTER_AUTH_ADMIN_USER_IDS: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function createEnv(source: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    const errors = result.error.issues.map(issue => {
      const path = issue.path.join('.')
      const message = issue.message
      return `${path}: ${message}`
    }).join(', ')
    throw new Error(`Environment validation failed: ${errors}`)
  }

  return result.data
}

export const env = createEnv(process.env)
