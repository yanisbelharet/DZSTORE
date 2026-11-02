import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The admin always calls the API on its own origin under /api (ADR-0021).
const apiTarget = process.env.ADMIN_API_TARGET ?? 'http://localhost:3000';
const apiProxy = {
  '/api': {
    target: apiTarget,
    changeOrigin: false,
    rewrite: (path: string) => path.replace(/^\/api/u, ''),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: Number(process.env.ADMIN_PORT ?? 5173), strictPort: true, proxy: apiProxy },
  preview: { port: Number(process.env.ADMIN_PORT ?? 4173), strictPort: true, proxy: apiProxy },
  build: { sourcemap: true, target: 'es2023' },
});
