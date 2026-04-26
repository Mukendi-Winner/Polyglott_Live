import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const httpTarget = env.VITE_BACKEND_HTTP_URL || 'http://localhost:3001'
  const wsTarget = env.VITE_BACKEND_WS_URL || 'ws://localhost:3001'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: httpTarget,
          changeOrigin: true,
        },
        '/live': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  }
})
