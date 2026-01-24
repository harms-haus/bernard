import { Hono } from 'hono'
import { proxyToLangGraph } from '../utils/proxy'

const infoRoutes = new Hono()

// GET /api/info - Server info endpoint (proxied to LangGraph)
infoRoutes.get('/', async (c) => {
  return proxyToLangGraph(c, '/info')
})

export default infoRoutes
