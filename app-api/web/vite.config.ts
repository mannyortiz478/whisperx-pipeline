import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/upload': 'http://localhost:5001',
      '/status': 'http://localhost:5001',
      '/jobs': 'http://localhost:5001',
      '/models': 'http://localhost:5001',
      '/health': 'http://localhost:5001',
      '/audio': 'http://localhost:5001',
      '/download': 'http://localhost:5001',
    },
  },
})
