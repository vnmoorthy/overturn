import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    define: {
      __DEMO_KEY__: JSON.stringify(env.GEMINI_API_KEY || ''),
    },
    server: { port: 5173 },
    build: { outDir: 'dist', chunkSizeWarningLimit: 3000 },
  }
})
