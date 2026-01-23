import { Hono } from 'hono'
import { proxyRequest } from '../utils/proxy'

const proxyRoutes = new Hono()

// Transparent proxies (formerly Next.js rewrites)
// These routes have no server-side logic - just forward requests

// /api/runs/* → Proxy to http://127.0.0.1:2024/runs/*
proxyRoutes.all('/:path*', async (c) => {
  const path = c.req.path.replace(/^\/api\/runs/, '/runs')
  return proxyRequest(c, `http://127.0.0.1:2024${path}`)
})

export default proxyRoutes

// Separate proxy routes for store and audio
const storeProxyRoutes = new Hono()
storeProxyRoutes.all('/:path*', async (c) => {
  const path = c.req.path.replace(/^\/api\/store/, '/store')
  return proxyRequest(c, `http://127.0.0.1:2024${path}`)
})

const audioProxyRoutes = new Hono()
// /api/v1/audio/transcriptions → Proxy to http://127.0.0.1:8870/inference
audioProxyRoutes.all('/transcriptions', async (c) => {
  return proxyRequest(c, 'http://127.0.0.1:8870/inference')
})

// /api/v1/audio/speech → Proxy to http://127.0.0.1:8880/v1/audio/speech
audioProxyRoutes.all('/speech', async (c) => {
  return proxyRequest(c, 'http://127.0.0.1:8880/v1/audio/speech')
})

export { storeProxyRoutes, audioProxyRoutes }
