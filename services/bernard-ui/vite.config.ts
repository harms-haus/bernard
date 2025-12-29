import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
   base: '/bernard/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8810,
    host: '127.0.0.1',
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3456',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/bernard/api')
      },
      '/auth': {
        target: 'http://127.0.0.1:3456',
        changeOrigin: true,
        secure: false,
      },
      '/bernard/api': {
        target: 'http://127.0.0.1:3456',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
