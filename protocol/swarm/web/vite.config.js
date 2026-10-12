import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 3721,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3720', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:3720', changeOrigin: true },
    },
  },
});
