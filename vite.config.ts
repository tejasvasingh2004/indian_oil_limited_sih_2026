import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // three.js (the lazy 3D page) is ~550 kB on its own; it loads only when that page opens
  build: { chunkSizeWarningLimit: 600 },
  server: {
    // live mode: the FastAPI backend on :8000 (falls back to the browser twin if it is not running)
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:8000', ws: true, changeOrigin: true } },
  },
  preview: { proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:8000', ws: true, changeOrigin: true } } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
