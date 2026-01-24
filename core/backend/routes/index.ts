import { Hono } from 'hono'
import authRoutes from './auth'
import threadsRoutes from './threads'
import assistantsRoutes from './assistants'
import proxyRoutes, { storeProxyRoutes, audioProxyRoutes } from './proxy'
import v1Routes from './v1'
import adminRoutes from './admin'
import servicesRoutes from './services'
import statusRoutes from './status'
import infoRoutes from './info'
import tasksRoutes from './tasks'
import tokensRoutes from './tokens'
import usersRoutes from './users'
import healthRoutes from './health'
import threadsCheckpointsRoutes from './threads-checkpoints'
import bernardStreamRoutes from './bernard-stream'
import logsRoutes from './logs'

const routes = new Hono()

// Mount all route modules
routes.route('/auth', authRoutes)
routes.route('/threads', threadsRoutes) // Includes streaming routes
routes.route('/threads', threadsCheckpointsRoutes) // Checkpoints and history routes (more specific, mounted after)
routes.route('/assistants', assistantsRoutes)
routes.route('/runs', proxyRoutes) // Transparent proxy for /api/runs/*
routes.route('/store', storeProxyRoutes) // Transparent proxy for /api/store/*
routes.route('/v1', v1Routes)
routes.route('/v1/audio', audioProxyRoutes) // Audio proxy routes
routes.route('/admin', adminRoutes)
routes.route('/services', servicesRoutes)
routes.route('/status', statusRoutes)
routes.route('/info', infoRoutes)
routes.route('/tasks', tasksRoutes)
routes.route('/tokens', tokensRoutes)
routes.route('/users', usersRoutes)
routes.route('/health', healthRoutes)
routes.route('/bernard', bernardStreamRoutes) // Bernard stream route
routes.route('/logs', logsRoutes) // Logs streaming route

export default routes
