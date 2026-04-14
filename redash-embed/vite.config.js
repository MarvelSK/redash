import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const proxyTargets = [
  process.env.VITE_REDASH_PROXY_TARGET,
  process.env.REDASH_PROXY_TARGET,
  'http://chwinclt59old:5001',
  'http://localhost:5001',
].filter(Boolean);

const primaryProxyTarget = proxyTargets[0];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/redash-api': {
        target: primaryProxyTarget,
        changeOrigin: true,
        secure: false,
        rewrite: path => path.replace(/^\/redash-api/, ''),
        configure(proxy, options) {
          proxy.on('error', (_err, req, res) => {
            if (res.headersSent) {
              return;
            }

            for (let i = 1; i < proxyTargets.length; i += 1) {
              const candidateTarget = proxyTargets[i];

              try {
                proxy.web(req, res, {
                  ...options,
                  target: candidateTarget,
                });
                return;
              } catch {
                // Keep trying the next target.
              }
            }

            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Redash proxy target is unavailable' }));
          });
        },
      },
    },
  },
});
