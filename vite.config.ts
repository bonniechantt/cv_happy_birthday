import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react()],
    // GitHub Pages sets VITE_BASE_PATH; local development stays at the root.
    base: env.VITE_BASE_PATH || '/',
    server: { host: '0.0.0.0', port: 5173, strictPort: true, allowedHosts: ['reasoning-revisions-comprehensive-bread.trycloudflare.com'] },
  }
})
