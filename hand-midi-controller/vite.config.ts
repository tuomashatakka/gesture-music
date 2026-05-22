import { defineConfig } from 'vite';

export default defineConfig({
  base: '/hand-midi-controller/',
  server: {
    port: 3001,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
