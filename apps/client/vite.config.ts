import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    checker({ typescript: true }),
  ],
  resolve: {
    alias: {
      '@mythicforge/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@mythicforge/dice-engine': path.resolve(__dirname, '../../packages/dice-engine/src/index.ts'),
      '@mythicforge/network': path.resolve(__dirname, '../../packages/network/src/index.ts'),
      '@mythicforge/plugin-api': path.resolve(__dirname, '../../packages/plugin-api/src/index.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/assets': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'pixi': ['pixi.js'],
          'three': ['three'],
          'zustand': ['zustand', 'immer'],
          'mythicforge-core': [
            '@mythicforge/shared',
            '@mythicforge/dice-engine',
            '@mythicforge/network',
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['pixi.js', 'three'],
  },
});
