import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/upload': 'http://localhost:5001',
      '/status': 'http://localhost:5001',
      '/jobs': {
        target: 'http://localhost:5001',
        bypass: (req) => {
          const url    = req.url ?? '';
          const method = (req.method ?? 'GET').toUpperCase();
          // SPA navigation: serve index.html instead of proxying to Flask
          if (method === 'GET' && /^\/jobs\/[^/]+\/transcript(\?|$)/.test(url)) {
            return '/index.html';
          }
          return null;
        },
      },
      '/models': 'http://localhost:5001',
      '/health': 'http://localhost:5001',
      '/audio': 'http://localhost:5001',
      '/download': 'http://localhost:5001',
    },
  },
})
