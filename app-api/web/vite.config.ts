import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env so we can reference it at config time if needed
  const _env = loadEnv(mode, process.cwd(), '');
  void _env;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@whisperx/shared-types': resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      },
    },
    server: {
      proxy: {
        '/upload':   { target: 'http://localhost:5001', changeOrigin: true },
        '/status':   { target: 'http://localhost:5001', changeOrigin: true },
        '/jobs': {
          target: 'http://localhost:5001',
          changeOrigin: true,
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
        '/models':   { target: 'http://localhost:5001', changeOrigin: true },
        '/health':   { target: 'http://localhost:5001', changeOrigin: true },
        '/audio':    { target: 'http://localhost:5001', changeOrigin: true },
        '/download': { target: 'http://localhost:5001', changeOrigin: true },
      },
    },
  };
});
