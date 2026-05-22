import { defineConfig } from 'vite'


export default defineConfig({
  base:   '/gesture-music/',
  server: {
    port: 3333,
    open: true
  },
  build: {
    outDir:    'dist',
    sourcemap: true
  }
})
