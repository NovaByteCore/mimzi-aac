import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Mimzi ships its own hand-written service worker (public/sw.js) instead of a
// PWA plugin, so the offline behaviour is small, readable and auditable.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    build: {
      target: ['safari15', 'chrome100'],
      sourcemap: false,
    },
    server: {
      port: 5173,
    },
  };
});
