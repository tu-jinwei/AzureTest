import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/AzureTest/',
  server: {
    port: 8079,
    host: '0.0.0.0',
    allowedHosts: ['uat.heph-ai.net'],
  },
  build: {
    outDir: 'dist',
  },
})
