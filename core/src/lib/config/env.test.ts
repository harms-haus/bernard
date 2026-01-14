import { describe, it, expect, beforeEach } from 'vitest'
import { createEnv, type Env } from './env'

describe('env', () => {
  describe('createEnv', () => {
    it('should parse valid environment variables', () => {
      const result = createEnv({
        NODE_ENV: 'production',
        PORT: '4000',
        HOST: '127.0.0.1',
        REDIS_URL: 'redis://localhost:6379',
        SESSION_TTL_SECONDS: '3600',
        TZ: 'America/New_York',
        BERNARD_API_URL: 'http://api.example.com',
        VLLM_URL: 'http://vllm.example.com',
        WHISPER_URL: 'http://whisper.example.com',
        KOKORO_URL: 'http://kokoro.example.com',
        BERNARD_UI_URL: 'http://ui.example.com',
      })

      expect(result.NODE_ENV).toBe('production')
      expect(result.PORT).toBe(4000)
      expect(result.HOST).toBe('127.0.0.1')
      expect(result.REDIS_URL).toBe('redis://localhost:6379')
      expect(result.SESSION_TTL_SECONDS).toBe(3600)
      expect(result.TZ).toBe('America/New_York')
      expect(result.BERNARD_API_URL).toBe('http://api.example.com')
    })

    it('should use default values for missing variables', () => {
      const result = createEnv({})

      expect(result.NODE_ENV).toBe('development')
      expect(result.PORT).toBe(3456)
      expect(result.HOST).toBe('0.0.0.0')
      expect(result.REDIS_URL).toBe('redis://localhost:6379')
      expect(result.SESSION_TTL_SECONDS).toBe(604800)
      expect(result.TZ).toBe('America/Chicago')
      expect(result.BERNARD_API_URL).toBe('http://localhost:8800')
    })

    it('should handle test environment', () => {
      const result = createEnv({
        NODE_ENV: 'test',
        REDIS_URL: 'redis://test-host:6379',
        BERNARD_API_URL: 'http://test-api:8800',
      })

      expect(result.NODE_ENV).toBe('test')
      expect(result.REDIS_URL).toBe('redis://test-host:6379')
    })

    it('should coerce PORT to number', () => {
      const result = createEnv({ PORT: '8080' })
      expect(result.PORT).toBe(8080)
      expect(typeof result.PORT).toBe('number')
    })

    it('should coerce SESSION_TTL_SECONDS to number', () => {
      const result = createEnv({ SESSION_TTL_SECONDS: '86400' })
      expect(result.SESSION_TTL_SECONDS).toBe(86400)
      expect(typeof result.SESSION_TTL_SECONDS).toBe('number')
    })

    it('should handle optional ADMIN_API_KEY', () => {
      const withoutKey = createEnv({})
      expect(withoutKey.ADMIN_API_KEY).toBeUndefined()

      const withKey = createEnv({ ADMIN_API_KEY: '12345678901234567890123456789012' })
      expect(withKey.ADMIN_API_KEY).toBe('12345678901234567890123456789012')
    })

    it('should handle invalid URL gracefully in test mode', () => {
      const result = createEnv({
        REDIS_URL: 'not-a-url',
      })

      expect(result.REDIS_URL).toBe('not-a-url')
    })

    it('should return type Env', () => {
      const result = createEnv({})
      expect(result).toHaveProperty('NODE_ENV')
      expect(result).toHaveProperty('PORT')
      expect(result).toHaveProperty('HOST')
      expect(result).toHaveProperty('REDIS_URL')
      expect(result).toHaveProperty('SESSION_TTL_SECONDS')
      expect(result).toHaveProperty('TZ')
      expect(result).toHaveProperty('BERNARD_API_URL')
      expect(result).toHaveProperty('VLLM_URL')
      expect(result).toHaveProperty('WHISPER_URL')
      expect(result).toHaveProperty('KOKORO_URL')
      expect(result).toHaveProperty('BERNARD_UI_URL')
    })

    it('should handle development environment with minimal config', () => {
      const result = createEnv({
        NODE_ENV: 'development',
        REDIS_URL: 'redis://localhost:6379',
      })

      expect(result.NODE_ENV).toBe('development')
      expect(result.REDIS_URL).toBe('redis://localhost:6379')
    })
  })

  describe('env module-level export', () => {
    it('should have env defined after module load', async () => {
      const { env } = await import('./env')
      expect(env).toBeDefined()
      expect(env.NODE_ENV).toBeDefined()
    })

    it('should have correct types in module export', async () => {
      const { env } = await import('./env')
      expect(typeof env.PORT).toBe('number')
      expect(typeof env.HOST).toBe('string')
      expect(typeof env.REDIS_URL).toBe('string')
    })
  })
})
