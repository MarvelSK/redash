import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const proxyTarget =
  process.env.VITE_REDASH_PROXY_TARGET || process.env.REDASH_PROXY_TARGET || 'http://localhost:5001';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/redash-api': {
        target: proxyTarget,
        changeOrigin: false,
        secure: false,
        rewrite: path => path.replace(/^\/redash-api/, ''),
      },
    },
  },
});
