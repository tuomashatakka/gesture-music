import { defineConfig } from 'vite';

export default defineConfig({
  base: '/gesture-music/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  optimizeDeps: {
    include: ['@mediapipe/hands']
  }
});
