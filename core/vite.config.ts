import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import devServer, { defaultOptions } from '@hono/vite-dev-server'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    // Hono dev server for unified frontend + backend
    devServer({
      entry: './backend/server.ts',
      // Exclude frontend routes from Hono handling - let Vite handle them
      // This allows React Router to handle client-side routing
      // Only /api/* and /health routes go to Hono, everything else goes to Vite
      exclude: [
        // Exclude all routes that don't start with /api or /health
        // Use regex to match frontend routes (everything except /api/* and /health)
        /^\/(?!api|health).*$/,
        // Keep default exclusions for static assets
        ...defaultOptions.exclude,
      ],
    }),
  ],
  css: {
    postcss: './postcss.config.js', // Required for Tailwind CSS processing
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Client-side Node.js polyfills (for browser compatibility)
      // These are empty modules since Node.js built-ins aren't available in browser
      fs: path.resolve(__dirname, './src/lib/polyfills/empty.ts'),
      net: path.resolve(__dirname, './src/lib/polyfills/empty.ts'),
      tls: path.resolve(__dirname, './src/lib/polyfills/empty.ts'),
      crypto: path.resolve(__dirname, './src/lib/polyfills/empty.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // Externalize worker_threads for server-side builds (handled by Bun)
      external: (id) => {
        // Only externalize for server builds (backend/server.ts)
        if (id === 'worker_threads') {
          return true
        }
        return false
      },
    },
  },
  optimizeDeps: {
    // Suppress langchain warnings (equivalent to webpack exprContextCritical: false)
    exclude: ['langchain/chat_models/universal'],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  server: {
    port: 3456,
    host: '0.0.0.0',
  },
})
