import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  server: {
    proxy: { '/api': 'http://localhost:8080', '/health': 'http://localhost:8080' },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        prototype: resolve(__dirname, 'prototype.html'),
      },
    },
  },
})
