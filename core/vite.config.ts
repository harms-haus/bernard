import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { hono } from '@hono/vite-dev-server'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    // Hono dev server for unified frontend + backend
    hono({
      entry: './backend/server.ts',
    }),
  ],
  css: {
    postcss: './postcss.config.js', // Required for Tailwind CSS processing
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
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
