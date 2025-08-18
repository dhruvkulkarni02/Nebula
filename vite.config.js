import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../build',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true, // Don't try other ports if 3000 is busy
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@components': path.resolve(__dirname, 'src/renderer/components'),
      '@utils': path.resolve(__dirname, 'src/renderer/utils'),
    },
  },
});
