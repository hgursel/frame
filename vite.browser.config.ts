import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'extension',
  publicDir: false,
  plugins: [react()],
  base: './',
  build: {
    outDir: '../dist/browser-extension',
    emptyOutDir: true,
    rollupOptions: {
      input: { panel: 'extension/sidepanel.html', background: 'extension/background.js' },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
