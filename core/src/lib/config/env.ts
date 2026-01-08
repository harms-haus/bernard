import { z } from "zod"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3456),
  HOST: z.string().default("0.0.0.0"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  ADMIN_API_KEY: z.string().min(32).optional(),
  SESSION_TTL_SECONDS: z.coerce.number().default(604800),
  TZ: z.string().default("America/Chicago"),
  // Service URLs
  BERNARD_API_URL: z.string().url().default("http://localhost:8800"),
  VLLM_URL: z.string().url().default("http://localhost:8860"),
  WHISPER_URL: z.string().url().default("http://localhost:8870"),
  KOKORO_URL: z.string().url().default("http://localhost:8880"),
  BERNARD_UI_URL: z.string().url().default("http://localhost:8810"),
})

export const env = envSchema.parse(process.env)

export type Env = z.infer<typeof envSchema>
