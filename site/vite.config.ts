import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 1420,
    proxy: {
      '/surfari': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/_next': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
