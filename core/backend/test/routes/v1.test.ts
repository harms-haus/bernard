import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import v1Routes from '../../routes/v1'

describe('POST /api/v1/chat/completions', () => {
  const app = new Hono()
  app.route('/api', v1Routes)

  it('should validate required messages', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [],
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.type).toBe('invalid_request_error')
    expect(body.error.message).toContain('messages must contain at least one message')
  })

  it('should reject unsupported parameters - presence_penalty', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [{ role: 'user', content: 'Hello' }],
        presence_penalty: 0.5,
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.type).toBe('invalid_request_error')
    expect(body.error.message).toContain('presence_penalty parameter is not supported')
    expect(body.error.param).toBe('presence_penalty')
  })

  it('should reject unsupported parameters - frequency_penalty', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [{ role: 'user', content: 'Hello' }],
        frequency_penalty: 0.5,
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.type).toBe('invalid_request_error')
    expect(body.error.message).toContain('frequency_penalty parameter is not supported')
    expect(body.error.param).toBe('frequency_penalty')
  })

  it('should reject unsupported parameters - stop', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [{ role: 'user', content: 'Hello' }],
        stop: 'END',
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.type).toBe('invalid_request_error')
    expect(body.error.message).toContain('stop parameter is not supported')
    expect(body.error.param).toBe('stop')
  })

  it('should reject unsupported parameters - n != 1', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [{ role: 'user', content: 'Hello' }],
        n: 2,
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.type).toBe('invalid_request_error')
    expect(body.error.message).toContain('Only n=1 is supported')
    expect(body.error.param).toBe('n')
  })

  it('should accept supported OpenAI parameters', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        temperature: 0.7,
        max_completion_tokens: 1000,
        top_p: 0.9,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(response.status).toBe(200)
  })

  it('should return OpenAI format for non-streaming requests', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        stream: false,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.object).toBe('chat.completion')
    expect(body.id).toMatch(/^chatcmpl-/)
    expect(body.choices).toBeDefined()
    expect(body.choices).toHaveLength(1)
    expect(body.choices[0].message.role).toBe('assistant')
    expect(body.choices[0].finish_reason).toBe('stop')
    expect(body.usage).toBeDefined()
    expect(body.service_tier).toBe('default')
  })

  it('should stream responses when stream=true', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })

  it('should validate message role values', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [{ role: 'invalid_role', content: 'Hello' }],
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.type).toBe('invalid_request_error')
  })

  it('should validate parameter ranges - temperature', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 3,
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.type).toBe('invalid_request_error')
  })

  it('should validate parameter ranges - top_p', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [{ role: 'user', content: 'Hello' }],
        top_p: 1.5,
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.type).toBe('invalid_request_error')
  })

  it('should validate thread_id format', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [{ role: 'user', content: 'Hello' }],
        thread_id: 'invalid@thread',
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.type).toBe('invalid_request_error')
  })

  it('should accept n=1 as supported value', async () => {
    const response = await app.request('/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'bernard_agent',
        messages: [{ role: 'user', content: 'Hello' }],
        n: 1,
      }),
    })

    expect(response.status).toBe(200)
  })
})
