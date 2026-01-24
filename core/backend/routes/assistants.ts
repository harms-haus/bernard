import { Hono } from 'hono'
import { proxyToLangGraph } from '../utils/proxy'

const assistantsRoutes = new Hono()

// GET /api/assistants - List assistants
assistantsRoutes.get('/', async (c) => {
  const { searchParams } = new URL(c.req.url)
  const query = searchParams.toString()
  const path = `/assistants${query ? `?${query}` : ''}`
  return proxyToLangGraph(c, path)
})

// POST /api/assistants - Create assistant
assistantsRoutes.post('/', async (c) => {
  return proxyToLangGraph(c, '/assistants')
})

// GET /api/assistants/:assistantId - Get assistant details
assistantsRoutes.get('/:assistantId', async (c) => {
  const { assistantId } = c.req.param()
  const path = `/assistants/${assistantId}`
  return proxyToLangGraph(c, path)
})

// POST /api/assistants/search - Search assistants
assistantsRoutes.post('/search', async (c) => {
  return proxyToLangGraph(c, '/assistants/search')
})

export default assistantsRoutes
