import { Hono } from 'hono'
import jobsRoutes from './admin/jobs'
import providersRoutes from './admin/providers'
import servicesTestRoutes from './admin/services-test'
import systemRoutes from './admin/system'
import modelsRoutes from './admin/models'
import oauthRoutes from './admin/oauth'
import limitsRoutes from './admin/limits'
import backupsRoutes from './admin/backups'
import servicesRoutes from './admin/services'

const adminRoutes = new Hono()

// Mount all admin sub-routes
adminRoutes.route('/jobs', jobsRoutes)
adminRoutes.route('/providers', providersRoutes)
adminRoutes.route('/services/test', servicesTestRoutes) // Test routes at /services/test/*
adminRoutes.route('/services', servicesRoutes) // Settings routes at /services
adminRoutes.route('/system', systemRoutes)
adminRoutes.route('/models', modelsRoutes)
adminRoutes.route('/oauth', oauthRoutes)
adminRoutes.route('/limits', limitsRoutes)
adminRoutes.route('/backups', backupsRoutes)

export default adminRoutes
