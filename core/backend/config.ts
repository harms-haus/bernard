// Server configuration
export const serverConfig = {
  port: parseInt(process.env.PORT || '3456', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
}
